// Package orchestrator owns the hand-rolled move/gate state machine (P0-A,
// P0-1, P0-8; SPEC §3): the per-dish gated loop
//
//	idle → proposing → awaiting_gate → (accepted|blocked|cancelled|failed) → idle
//
// with the switch over the six gate verbs, strict single-flight moves,
// idempotent gate resolution keyed on proposal id, and the autonomy dial
// that auto-advances deterministic moves. accepted/cancelled/failed land
// back on idle immediately; blocked persists until regenerate or redirect.
// No FSM library — plain switch/case per SPEC.
//
// All per-dish gate state (pending proposals, blocked move, resolved verb
// outcomes, the in-flight generation) lives in server memory by design: it
// survives page refresh via GET /dishes/{id}, and is lost on restart
// (consistent with no-store-pre-accept). Only events and accepted versions
// persist. One orchestrator mutex serializes transitions and the store I/O
// inside them — v0 is a single-operator tool; generation, the slow part,
// runs outside the lock.
package orchestrator

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/grounding"
	"github.com/ogngnaoh/capycook/internal/llm"
	"github.com/ogngnaoh/capycook/internal/proposal"
	"github.com/ogngnaoh/capycook/internal/services"
	"github.com/ogngnaoh/capycook/internal/store"
	"github.com/ogngnaoh/capycook/internal/telemetry"
)

// Dish states. The transient accept/cancel/fail outcomes are not observable
// states: they transition straight back to idle within one locked section.
const (
	StateIdle         = "idle"
	StateProposing    = "proposing"
	StateAwaitingGate = "awaiting_gate"
	StateBlocked      = "blocked" // only regenerate/redirect allowed next
)

// Outcome kinds delivered to the Notify hook.
const (
	OutcomeReady        = "ready"
	OutcomeBlocked      = "blocked"
	OutcomeCancelled    = "cancelled"
	OutcomeFailed       = "failed"
	OutcomeAutoAdvanced = "auto_advanced"
)

// Sentinel errors. httpapi maps ErrInFlight to 409; the rest map as it sees
// fit (404 for unknown proposals, 400/409 for the others).
var (
	ErrInFlight        = errors.New("orchestrator: a move is already in flight")
	ErrAwaitingGate    = errors.New("orchestrator: a proposal is awaiting the gate")
	ErrBlocked         = errors.New("orchestrator: dish is blocked; only regenerate or redirect allowed")
	ErrUnknownProposal = errors.New("orchestrator: unknown or stale proposal id")
	ErrConfirmRequired = errors.New("orchestrator: safety warning requires confirm override")
	ErrUnknownMoveType = errors.New("orchestrator: unknown move type")
	ErrUnknownVerb     = errors.New("orchestrator: unknown gate verb")
	ErrVerbNotAllowed  = errors.New("orchestrator: verb not allowed in this state")
)

// Deps are the edges the orchestrator drives. All are required except
// Notify, which may be nil.
type Deps struct {
	Store     store.Store
	Log       eventlog.EventLog
	LLM       llm.LLM
	Safety    services.SafetyGate
	Nutrition services.Nutrition
	Cost      services.Cost
	Grounding grounding.Grounding
	// Arm is the grounding-toggle arm (spec §4 enum): it stamps every
	// appended event and drives per-move evidence assembly
	// (llm.BuildEvidence, spec §7 matrix). Empty defaults to "none" —
	// normal operator use, which runs the full grounded path with "none"
	// recorded on events (the toggle is an eval construct; the Phase-4
	// harness sets the explicit eval arms).
	Arm string
	// CostCitation and NutritionCitation are the deterministic-citation
	// provenance for cost/nutrition recompute proposals (task 2.8): wiring
	// fills them from the committed data assets' PROVENANCE files. Zero
	// values fall back to generic capycook-services citations (stub mode).
	CostCitation      proposal.Citation
	NutritionCitation proposal.Citation
	// Tracer wraps each llm.GenerateMove call in one span (task 3.5) —
	// domain events stay eventlog-only, never traced (SPEC §5
	// no-double-tracing). Nil defaults to the no-op.
	Tracer telemetry.Tracer
	// Notify is called (outside the orchestrator lock) with every move
	// outcome after the safety screen has run — the transport layer turns
	// these into SSE events.
	Notify func(Outcome)
}

// Outcome is one resolved move, reported after the safety screen: the only
// payloads that ever reach a client. Blocked outcomes carry reason/rule id
// only — the blocked proposal itself is discarded before this point.
type Outcome struct {
	DishID       string
	MoveID       string
	Kind         string              // ready|blocked|cancelled|failed|auto_advanced
	Proposals    []proposal.Proposal // ready: 1 (2 for alternatives); auto_advanced: 1
	NewVersionID string              // auto_advanced
	Reason       string              // blocked|failed
	RuleID       string              // blocked
}

// Status is the in-memory gate view GET /dishes/{id} needs alongside the
// stored draft.
type Status struct {
	State          string
	Pending        []proposal.Proposal
	InFlightMoveID string
	BlockedMoveID  string // gate target for regenerate/redirect while blocked
	BlockedReason  string
	BlockedRuleID  string
}

// Orchestrator is the per-process state machine over every dish.
type Orchestrator struct {
	store         store.Store
	log           eventlog.EventLog
	llm           llm.LLM
	safety        services.SafetyGate
	nutrition     services.Nutrition
	cost          services.Cost
	grounding     grounding.Grounding
	costCite      proposal.Citation
	nutritionCite proposal.Citation
	tracer        telemetry.Tracer
	notify        func(Outcome)

	// arm/runKind stamp every appended event (operator defaults per spec
	// §4); arm also selects the per-move evidence assembly (spec §7 matrix).
	// The phase-4 harness runner constructs its own values.
	arm     string
	runKind string

	mu     sync.Mutex
	dishes map[string]*dishState
}

// dishState is the in-memory machine for one dish. Guarded by
// Orchestrator.mu.
type dishState struct {
	state    string
	inflight *inflightMove
	pending  []pendingProposal
	blocked  *blockedMove
	// resolved keys every gate-resolved id (pending proposal ids, and move
	// ids resolved from the blocked/proposing states) to its outcome:
	// duplicate verb calls return the prior outcome and touch nothing.
	resolved map[string]GateResult
}

// inflightMove keeps the original move parameters beside the cancel func so
// a redirect during proposing can re-run the same move type.
type inflightMove struct {
	moveID   string
	moveType string
	steer    string
	cancel   context.CancelFunc
}

// pendingProposal keeps the original move parameters beside the proposal so
// regenerate can re-sample the exact same request.
type pendingProposal struct {
	prop     proposal.Proposal
	moveType string
	steer    string
}

type blockedMove struct {
	moveID   string
	moveType string
	steer    string
	reason   string
	ruleID   string
}

// New wires an Orchestrator over its edges.
func New(d Deps) *Orchestrator {
	arm := d.Arm
	if arm == "" {
		arm = llm.ArmNone
	}
	tracer := d.Tracer
	if tracer == nil {
		tracer = telemetry.Noop{}
	}
	return &Orchestrator{
		store:         d.Store,
		log:           d.Log,
		llm:           d.LLM,
		safety:        d.Safety,
		nutrition:     d.Nutrition,
		cost:          d.Cost,
		grounding:     d.Grounding,
		costCite:      d.CostCitation,
		nutritionCite: d.NutritionCitation,
		tracer:        tracer,
		notify:        d.Notify,
		arm:           arm,
		runKind:       "operator",
		dishes:        make(map[string]*dishState),
	}
}

// ds returns (creating if needed) the in-memory state for a dish. Caller
// holds mu.
func (o *Orchestrator) ds(dishID string) *dishState {
	s, ok := o.dishes[dishID]
	if !ok {
		s = &dishState{state: StateIdle, resolved: make(map[string]GateResult)}
		o.dishes[dishID] = s
	}
	return s
}

// Move starts a move for the dish and returns its move id. Creative moves
// run asynchronously (the outcome arrives via Notify after the safety
// screen); deterministic moves resolve synchronously — auto-advancing into
// a new version when the dish's autonomy dial is on, pending at the gate
// when it is off. A second move while one is in flight returns ErrInFlight.
func (o *Orchestrator) Move(ctx context.Context, dishID, sessionID, moveType, steer string) (string, error) {
	if !validMoveType(moveType) {
		return "", fmt.Errorf("%w: %q", ErrUnknownMoveType, moveType)
	}
	o.mu.Lock()
	ds := o.ds(dishID)
	switch ds.state {
	case StateProposing:
		o.mu.Unlock()
		return "", ErrInFlight
	case StateAwaitingGate:
		o.mu.Unlock()
		return "", ErrAwaitingGate
	case StateBlocked:
		o.mu.Unlock()
		return "", ErrBlocked
	}
	dish, cur, thread, err := o.moveInputs(ctx, dishID)
	if err != nil {
		o.mu.Unlock()
		return "", err
	}
	moveID := newID("mv")
	// move_requested carries moveType + steer verbatim: the steering thread
	// is reconstructed by replaying these payloads.
	if err := o.append(ctx, dishID, sessionID, eventlog.TypeMoveRequested,
		movePayload{MoveID: moveID, MoveType: moveType, Steer: steer}); err != nil {
		o.mu.Unlock()
		return "", err
	}
	out, err := o.launch(ctx, ds, moveKickoff{
		dishID: dishID, sessionID: sessionID, moveID: moveID,
		moveType: moveType, steer: steer, n: 1,
	}, dish, cur, thread)
	o.mu.Unlock()
	if err != nil {
		return "", err
	}
	if out != nil {
		o.emit(*out)
	}
	return moveID, nil
}

// Cancel aborts the dish's in-flight move: the generation context is
// cancelled, nothing is stored, and a move_cancelled event is appended. It
// reports whether a move was actually cancelled — cancelling when nothing
// is in flight is a silent no-op, so the accept-vs-cancel race resolves as
// "first transition wins, loser is a no-op".
func (o *Orchestrator) Cancel(ctx context.Context, dishID, sessionID string) (bool, error) {
	o.mu.Lock()
	ds := o.ds(dishID)
	if ds.state != StateProposing || ds.inflight == nil {
		o.mu.Unlock()
		return false, nil
	}
	fl := ds.inflight
	fl.cancel()
	ds.inflight = nil
	ds.state = StateIdle
	err := o.append(ctx, dishID, sessionID, eventlog.TypeMoveCancelled, cancelledPayload{MoveID: fl.moveID})
	o.mu.Unlock()
	if err != nil {
		return true, err
	}
	o.emit(Outcome{DishID: dishID, MoveID: fl.moveID, Kind: OutcomeCancelled})
	return true, nil
}

// Status reports the dish's in-memory gate state. Unknown dishes are idle.
func (o *Orchestrator) Status(dishID string) Status {
	o.mu.Lock()
	defer o.mu.Unlock()
	ds, ok := o.dishes[dishID]
	if !ok {
		return Status{State: StateIdle}
	}
	st := Status{State: ds.state}
	for _, pp := range ds.pending {
		st.Pending = append(st.Pending, pp.prop)
	}
	if ds.inflight != nil {
		st.InFlightMoveID = ds.inflight.moveID
	}
	if ds.blocked != nil {
		st.BlockedMoveID = ds.blocked.moveID
		st.BlockedReason = ds.blocked.reason
		st.BlockedRuleID = ds.blocked.ruleID
	}
	return st
}

// IsDeterministic reports whether moveType is one of the deterministic move
// types (spec §4) the autonomy dial may auto-advance.
func IsDeterministic(moveType string) bool {
	switch moveType {
	case llm.MoveTypeScaleServings, llm.MoveTypeUnitConvert,
		llm.MoveTypeCostRecompute, llm.MoveTypeNutritionRecompute:
		return true
	}
	return false
}

func validMoveType(moveType string) bool {
	switch moveType {
	case llm.MoveTypeSeedExpand, llm.MoveTypeFlavorDirection, llm.MoveTypeIngredientChange,
		llm.MoveTypeTechniqueStep, llm.MoveTypeIterateFeedback:
		return true
	}
	return IsDeterministic(moveType)
}

// --- move launch (shared by Move and the respawning gate verbs) ---

// moveKickoff is one move about to run: ids, parameters, and how many
// parallel generations (alternatives asks for 2).
type moveKickoff struct {
	dishID    string
	sessionID string
	moveID    string
	moveType  string
	steer     string
	n         int
}

// launch dispatches a validated kickoff. Deterministic moves resolve
// synchronously and return their outcome; creative moves flip the dish to
// proposing and generate on a goroutine, returning nil. Caller holds mu and
// has already appended the event that records the kickoff (move_requested
// or a gate_* event).
func (o *Orchestrator) launch(ctx context.Context, ds *dishState, k moveKickoff, dish store.Dish, cur draft.Draft, thread []llm.ThreadTurn) (*Outcome, error) {
	if IsDeterministic(k.moveType) {
		return o.runDeterministic(ctx, ds, k, dish, cur)
	}
	genCtx, cancel := context.WithCancel(context.Background()) // outlives the HTTP request
	ds.inflight = &inflightMove{moveID: k.moveID, moveType: k.moveType, steer: k.steer, cancel: cancel}
	ds.state = StateProposing
	ds.blocked = nil
	go o.generate(genCtx, k, cur, thread)
	return nil, nil
}

// generate runs the LLM call(s) outside the lock, then commits the result.
func (o *Orchestrator) generate(genCtx context.Context, k moveKickoff, cur draft.Draft, thread []llm.ThreadTurn) {
	req := llm.MoveRequest{
		Draft:    cur,
		MoveType: k.moveType,
		Steer:    k.steer,
		Thread:   thread,
		Evidence: llm.BuildEvidence(o.arm, cur, o.grounding),
	}
	var props []proposal.Proposal
	var genErr error
	for i := 0; i < k.n; i++ {
		// One span per GenerateMove call, and ONLY here (SPEC §5
		// no-double-tracing): session_id/arm/move_type ride every span
		// because Langfuse reads trace-level fields per-span.
		spanCtx, end := o.tracer.StartSpan(genCtx, "llm.generate_move",
			telemetry.Attr{Key: "session_id", Value: k.sessionID},
			telemetry.Attr{Key: "arm", Value: o.arm},
			telemetry.Attr{Key: "move_type", Value: k.moveType},
		)
		p, err := o.llm.GenerateMove(spanCtx, req)
		end()
		if err != nil {
			genErr = err
			break
		}
		props = append(props, p)
	}
	o.mu.Lock()
	out := o.commitGeneration(k, cur, props, genErr)
	o.mu.Unlock()
	if out != nil {
		o.emit(*out)
	}
}

// commitGeneration lands a finished generation, unless the move lost a race
// to cancel/redirect — then it is dropped silently (the winner already
// appended its event and transitioned the state). The safety screen runs
// here, BEFORE anything is stored or notified: blocked proposals never
// reach a client. Caller holds mu.
func (o *Orchestrator) commitGeneration(k moveKickoff, cur draft.Draft, props []proposal.Proposal, genErr error) *Outcome {
	ds := o.ds(k.dishID)
	if ds.inflight == nil || ds.inflight.moveID != k.moveID {
		return nil // first transition won; this generation is the no-op loser
	}
	ds.inflight.cancel()
	ds.inflight = nil
	// The initiating HTTP request is long gone; events must still land.
	ctx := context.Background()
	if genErr != nil {
		// A canceller would have detached this move above, so any error —
		// parse, retry exhaustion, even a stray context.Canceled — is a real
		// failure. move_failed is distinct from proposal_blocked by design.
		ds.state = StateIdle
		o.appendOrLog(ctx, k.dishID, k.sessionID, eventlog.TypeMoveFailed,
			failedPayload{MoveID: k.moveID, Reason: genErr.Error()})
		return &Outcome{DishID: k.dishID, MoveID: k.moveID, Kind: OutcomeFailed, Reason: genErr.Error()}
	}
	var passing []pendingProposal
	var firstBlock *proposal.Safety
	for _, p := range props {
		// Grounding resolution rides the change set BEFORE the screen: the
		// allergen check keys on FDC/FoodOn ids (aliases are the resolver's
		// job, spec §5), and accept then stores the ids with the draft.
		p.Change = o.enrichOps(cur, p.Change)
		verdict := o.safety.Screen(cur, p.Change)
		if verdict.Status == "blocked" {
			if firstBlock == nil {
				v := verdict
				firstBlock = &v
			}
			continue
		}
		p.ID = newID("pr")
		p.MoveID = k.moveID
		p.Safety = verdict
		passing = append(passing, pendingProposal{prop: p, moveType: k.moveType, steer: k.steer})
	}
	// Mixed alternatives (one blocked, one passing) surface the passing
	// card(s) and drop the blocked one silently — the dish cannot be both
	// blocked and awaiting the gate. The stub cannot produce a mixed pair
	// (blocking is steer-driven), so v0 leaves this edge undertested.
	if len(passing) == 0 {
		reason, ruleID := first(firstBlock.Reasons), first(firstBlock.RuleIDs)
		ds.state = StateBlocked
		ds.pending = nil
		ds.blocked = &blockedMove{
			moveID: k.moveID, moveType: k.moveType, steer: k.steer,
			reason: reason, ruleID: ruleID,
		}
		o.appendOrLog(ctx, k.dishID, k.sessionID, eventlog.TypeProposalBlocked,
			blockedPayload{MoveID: k.moveID, Reason: reason, RuleID: ruleID})
		return &Outcome{DishID: k.dishID, MoveID: k.moveID, Kind: OutcomeBlocked, Reason: reason, RuleID: ruleID}
	}
	ds.state = StateAwaitingGate
	ds.pending = passing
	out := &Outcome{DishID: k.dishID, MoveID: k.moveID, Kind: OutcomeReady}
	for _, pp := range passing {
		o.appendOrLog(ctx, k.dishID, k.sessionID, eventlog.TypeProposalReady,
			readyPayload{MoveID: k.moveID, ProposalID: pp.prop.ID, MoveType: k.moveType})
		out.Proposals = append(out.Proposals, pp.prop)
	}
	return out
}

// runDeterministic computes a deterministic move via the services (never
// the LLM): confidence 1.0, deterministic citations. Dial ON applies it
// immediately as a new version and emits move_auto_advanced — never
// gate_accept; dial OFF pends it at the gate like any proposal. Caller
// holds mu.
func (o *Orchestrator) runDeterministic(ctx context.Context, ds *dishState, k moveKickoff, dish store.Dish, cur draft.Draft) (*Outcome, error) {
	prop, err := o.deterministicProposal(k.moveType, cur, k.steer)
	if err != nil {
		return nil, err
	}
	prop.ID = newID("pr")
	prop.MoveID = k.moveID
	verdict := o.safety.Screen(cur, prop.Change)
	if verdict.Status == "blocked" {
		reason, ruleID := first(verdict.Reasons), first(verdict.RuleIDs)
		ds.state = StateBlocked
		ds.pending = nil
		ds.blocked = &blockedMove{
			moveID: k.moveID, moveType: k.moveType, steer: k.steer,
			reason: reason, ruleID: ruleID,
		}
		if err := o.append(ctx, k.dishID, k.sessionID, eventlog.TypeProposalBlocked,
			blockedPayload{MoveID: k.moveID, Reason: reason, RuleID: ruleID}); err != nil {
			return nil, err
		}
		return &Outcome{DishID: k.dishID, MoveID: k.moveID, Kind: OutcomeBlocked, Reason: reason, RuleID: ruleID}, nil
	}
	prop.Safety = verdict
	if dish.AutonomyDial {
		applied, err := cur.Apply(prop.Change)
		if err != nil {
			return nil, fmt.Errorf("orchestrator: apply deterministic move: %w", err)
		}
		verID, err := o.commitVersion(ctx, dish, applied)
		if err != nil {
			return nil, err
		}
		if err := o.append(ctx, k.dishID, k.sessionID, eventlog.TypeMoveAutoAdvanced, autoAdvancedPayload{
			MoveID: k.moveID, MoveType: k.moveType, ProposalID: prop.ID,
			NewVersionID: verID, AutonomyDial: true,
		}); err != nil {
			return nil, err
		}
		ds.state = StateIdle
		return &Outcome{
			DishID: k.dishID, MoveID: k.moveID, Kind: OutcomeAutoAdvanced,
			Proposals: []proposal.Proposal{prop}, NewVersionID: verID,
		}, nil
	}
	ds.state = StateAwaitingGate
	ds.pending = []pendingProposal{{prop: prop, moveType: k.moveType, steer: k.steer}}
	ds.blocked = nil
	if err := o.append(ctx, k.dishID, k.sessionID, eventlog.TypeProposalReady,
		readyPayload{MoveID: k.moveID, ProposalID: prop.ID, MoveType: k.moveType}); err != nil {
		return nil, err
	}
	return &Outcome{DishID: k.dishID, MoveID: k.moveID, Kind: OutcomeReady, Proposals: []proposal.Proposal{prop}}, nil
}

// deterministicProposal builds the full proposal for a deterministic move
// type from the current draft (spec §4: services-computed, confidence 1.0,
// deterministic citations). The draft is grounding-resolved first, so the
// services key nutrition/allergen lookups on ids and the citations name the
// exact ids the computation used.
func (o *Orchestrator) deterministicProposal(moveType string, cur draft.Draft, steer string) (proposal.Proposal, error) {
	proposed := o.resolveDraft(cur)
	today := time.Now().Format("2006-01-02")
	var rationale string
	var cites []proposal.Citation
	var next []string
	switch moveType {
	case llm.MoveTypeScaleServings:
		oldServings := cur.Constraints.Servings
		if oldServings < 1 {
			oldServings = 1
		}
		// The servings stepper sends the target as the steer; without one,
		// double the batch.
		target := oldServings * 2
		if n, err := strconv.Atoi(strings.TrimSpace(steer)); err == nil && n > 0 {
			target = n
		}
		factor := float64(target) / float64(oldServings)
		proposed.Constraints.Servings = target
		for i := range proposed.Ingredients {
			proposed.Ingredients[i].Qty *= factor
		}
		rationale = fmt.Sprintf("Scaled the dish from %d to %d servings: every ingredient quantity multiplied by %.4g.", oldServings, target, factor)
		cites = []proposal.Citation{{Source: "capycook-services", Ref: "deterministic:scale_servings", Date: today}}
		next = []string{llm.MoveTypeCostRecompute, llm.MoveTypeNutritionRecompute}
	case llm.MoveTypeUnitConvert:
		for i := range proposed.Ingredients {
			ing := &proposed.Ingredients[i]
			switch {
			case ing.Unit == "g" && ing.Qty >= 1000:
				ing.Qty /= 1000
				ing.Unit = "kg"
			case ing.Unit == "ml" && ing.Qty >= 1000:
				ing.Qty /= 1000
				ing.Unit = "l"
			}
		}
		rationale = "Normalized bulk metric units: 1000 g or more becomes kilograms, 1000 ml or more becomes litres."
		cites = []proposal.Citation{{Source: "capycook-services", Ref: "deterministic:unit_convert", Date: today}}
		next = []string{llm.MoveTypeScaleServings, llm.MoveTypeCostRecompute}
	case llm.MoveTypeCostRecompute:
		c, err := o.cost.Compute(proposed)
		if err != nil {
			return proposal.Proposal{}, fmt.Errorf("orchestrator: cost recompute: %w", err)
		}
		proposed.Analysis.Cost = c
		rationale = "Recomputed the cost panel from the current ingredient list."
		cites = []proposal.Citation{o.costCitation(today)}
		next = []string{llm.MoveTypeNutritionRecompute}
	case llm.MoveTypeNutritionRecompute:
		n, err := o.nutrition.Compute(proposed)
		if err != nil {
			return proposal.Proposal{}, fmt.Errorf("orchestrator: nutrition recompute: %w", err)
		}
		proposed.Analysis.Nutrition = n
		rationale = "Recomputed the per-serving nutrition panel from the current ingredient list."
		cites = o.nutritionCitations(proposed, today)
		next = []string{llm.MoveTypeCostRecompute}
	default:
		return proposal.Proposal{}, fmt.Errorf("%w: %q is not deterministic", ErrUnknownMoveType, moveType)
	}
	change := proposal.ComputeDiff(cur, proposed)
	return proposal.Proposal{
		MoveType:      moveType,
		TargetFields:  proposal.TargetFields(change),
		Change:        change,
		Rationale:     rationale,
		Citations:     cites,
		Confidence:    1.0,
		Unverified:    []string{},
		SuggestedNext: next,
	}, nil
}

// costCitation is the wiring-supplied cost-table provenance, or the generic
// fallback when none was configured (tests, stub mode).
func (o *Orchestrator) costCitation(today string) proposal.Citation {
	if o.costCite != (proposal.Citation{}) {
		return o.costCite
	}
	return proposal.Citation{Source: "capycook-services", Ref: "deterministic:cost_recompute", Date: today}
}

// nutritionCitations is the wiring-supplied nutrition-source provenance plus
// one deterministic citation per resolved FDC id in d — exactly the ids the
// nutrition service keyed on. Ids come from the resolver, never invented.
func (o *Orchestrator) nutritionCitations(d draft.Draft, today string) []proposal.Citation {
	base := o.nutritionCite
	if base == (proposal.Citation{}) {
		base = proposal.Citation{Source: "capycook-services", Ref: "deterministic:nutrition_recompute", Date: today}
	}
	cites := []proposal.Citation{base}
	seen := make(map[string]bool)
	for _, ing := range d.Ingredients {
		if ing.FDCID == nil || *ing.FDCID == "" || seen[*ing.FDCID] {
			continue
		}
		seen[*ing.FDCID] = true
		cites = append(cites, proposal.Citation{
			Source: "usda-fdc",
			Ref:    fmt.Sprintf("fdc:%s (%s)", *ing.FDCID, ing.Name),
			Date:   base.Date,
		})
	}
	return cites
}

// --- shared plumbing ---

// moveInputs loads everything a move needs, with the thread rebuilt from
// the events appended so far — i.e. the history BEFORE the move being
// launched. Caller holds mu.
func (o *Orchestrator) moveInputs(ctx context.Context, dishID string) (store.Dish, draft.Draft, []llm.ThreadTurn, error) {
	dish, err := o.store.GetDish(ctx, dishID)
	if err != nil {
		return store.Dish{}, draft.Draft{}, nil, fmt.Errorf("orchestrator: load dish %s: %w", dishID, err)
	}
	cur, err := o.currentDraft(ctx, dish)
	if err != nil {
		return store.Dish{}, draft.Draft{}, nil, err
	}
	thread, err := o.thread(ctx, dishID)
	if err != nil {
		return store.Dish{}, draft.Draft{}, nil, err
	}
	return dish, cur, thread, nil
}

// currentDraft resolves the dish's current draft: the current version's
// snapshot, or — before any version exists — an empty draft carrying the
// dish's constraints.
func (o *Orchestrator) currentDraft(ctx context.Context, dish store.Dish) (draft.Draft, error) {
	if dish.CurrentVersionID == nil {
		var d draft.Draft
		if dish.ConstraintsJSON != "" {
			if err := json.Unmarshal([]byte(dish.ConstraintsJSON), &d.Constraints); err != nil {
				return draft.Draft{}, fmt.Errorf("orchestrator: parse dish constraints: %w", err)
			}
		}
		return d, nil
	}
	v, err := o.store.GetVersion(ctx, *dish.CurrentVersionID)
	if err != nil {
		return draft.Draft{}, fmt.Errorf("orchestrator: load current version: %w", err)
	}
	var d draft.Draft
	if err := json.Unmarshal([]byte(v.DraftJSON), &d); err != nil {
		return draft.Draft{}, fmt.Errorf("orchestrator: parse version draft: %w", err)
	}
	return d, nil
}

// thread rebuilds the steering thread (last 50 turns) by replaying
// move_requested and gate_redirect payloads — their steer texts, verbatim,
// as cook turns. v0 keeps the thread cook-only: rationales are not
// persisted pre-accept (no-store-pre-accept) and regenerate carries no
// rejection memory (R2 deferral), so no other event contributes a turn.
func (o *Orchestrator) thread(ctx context.Context, dishID string) ([]llm.ThreadTurn, error) {
	events, err := o.log.Replay(ctx, dishID)
	if err != nil {
		return nil, fmt.Errorf("orchestrator: replay events: %w", err)
	}
	var turns []llm.ThreadTurn
	for _, e := range events {
		switch e.Type {
		case eventlog.TypeMoveRequested, eventlog.TypeGateRedirect:
			var p struct {
				Steer string `json:"steer"`
			}
			if err := json.Unmarshal(e.Payload, &p); err != nil || p.Steer == "" {
				continue
			}
			turns = append(turns, llm.ThreadTurn{Role: "cook", Text: p.Steer})
		}
	}
	if len(turns) > 50 {
		turns = turns[len(turns)-50:]
	}
	return turns, nil
}

// resolveDraft returns d with the grounding resolver's ids filled onto
// every ingredient whose name resolves (spec §5 entity resolution), so
// nutrition/allergen lookups key on FDC/FoodOn ids. No-match means no id:
// unresolved ingredients keep whatever they carried (usually nil) and stay
// [unverified]/fail-closed downstream.
func (o *Orchestrator) resolveDraft(d draft.Draft) draft.Draft {
	out := clone(d)
	for i := range out.Ingredients {
		r, ok := o.grounding.Resolve(out.Ingredients[i].Name)
		if !ok {
			continue
		}
		if r.FDCID != nil {
			out.Ingredients[i].FDCID = r.FDCID
		}
		if r.FoodOnID != nil {
			out.Ingredients[i].FoodOnID = r.FoodOnID
		}
	}
	return out
}

// enrichOps re-diffs a change set so grounding-resolved ingredient ids ride
// the ops before the safety screen judges them. A change set that does not
// apply is returned unchanged — the screen fails closed on it.
func (o *Orchestrator) enrichOps(cur draft.Draft, ops []proposal.Op) []proposal.Op {
	proposed, err := cur.Apply(ops)
	if err != nil {
		return ops
	}
	return proposal.ComputeDiff(cur, o.resolveDraft(proposed))
}

// commitVersion grounding-resolves applied and recomputes analysis into it
// (self-contained snapshots: every accept refreshes ids, cost + nutrition),
// stores it as a new version whose parent is the dish's current version,
// and advances the dish pointer. This in-accept recompute is also what
// satisfies the "auto-enqueue deterministic recomputes after
// ingredient-touching accepts" rule in v0: the analysis is already fresh in
// the snapshot, so no separate move_auto_advanced fires (no double events).
// Caller holds mu.
func (o *Orchestrator) commitVersion(ctx context.Context, dish store.Dish, applied draft.Draft) (string, error) {
	applied = o.resolveDraft(applied)
	n, err := o.nutrition.Compute(applied)
	if err != nil {
		return "", fmt.Errorf("orchestrator: recompute nutrition: %w", err)
	}
	c, err := o.cost.Compute(applied)
	if err != nil {
		return "", fmt.Errorf("orchestrator: recompute cost: %w", err)
	}
	applied.Analysis = draft.Analysis{Cost: c, Nutrition: n}
	raw, err := json.Marshal(applied)
	if err != nil {
		return "", fmt.Errorf("orchestrator: marshal draft: %w", err)
	}
	verID := newID("ver")
	if err := o.store.CreateVersion(ctx, store.Version{
		ID: verID, DishID: dish.ID, ParentVersionID: dish.CurrentVersionID, DraftJSON: string(raw),
	}); err != nil {
		return "", fmt.Errorf("orchestrator: store version: %w", err)
	}
	dish.CurrentVersionID = &verID
	if err := o.store.UpdateDish(ctx, dish); err != nil {
		return "", fmt.Errorf("orchestrator: advance current version: %w", err)
	}
	return verID, nil
}

// append marshals payload and appends one event stamped with the caller's
// session id and the orchestrator's arm/run_kind.
func (o *Orchestrator) append(ctx context.Context, dishID, sessionID, eventType string, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("orchestrator: marshal %s payload: %w", eventType, err)
	}
	if err := o.log.Append(ctx, eventlog.Event{
		DishID: dishID, SessionID: sessionID, Type: eventType,
		Payload: raw, Arm: o.arm, RunKind: o.runKind,
	}); err != nil {
		return fmt.Errorf("orchestrator: append %s: %w", eventType, err)
	}
	return nil
}

// appendOrLog is append for the async commit path, where no caller can
// receive the error: it is logged and the in-memory transition stands.
func (o *Orchestrator) appendOrLog(ctx context.Context, dishID, sessionID, eventType string, payload any) {
	if err := o.append(ctx, dishID, sessionID, eventType, payload); err != nil {
		slog.Error("orchestrator: event append failed", "dish", dishID, "type", eventType, "err", err)
	}
}

func (o *Orchestrator) emit(out Outcome) {
	if o.notify != nil {
		o.notify(out)
	}
}

// --- event payloads (spec §4 wire shapes, snake_case) ---

type movePayload struct {
	MoveID   string `json:"move_id"`
	MoveType string `json:"move_type"`
	Steer    string `json:"steer"`
}

type readyPayload struct {
	MoveID     string `json:"move_id"`
	ProposalID string `json:"proposal_id"`
	MoveType   string `json:"move_type"`
}

type blockedPayload struct {
	MoveID string `json:"move_id"`
	Reason string `json:"reason"`
	RuleID string `json:"rule_id"`
}

type cancelledPayload struct {
	MoveID string `json:"move_id"`
}

type failedPayload struct {
	MoveID string `json:"move_id"`
	Reason string `json:"reason"`
}

// gatePayload records a gate verb; the autonomy-dial state rides on every
// gate event (spec §4).
type gatePayload struct {
	Verb         string `json:"verb"`
	ProposalID   string `json:"proposal_id"`
	MoveID       string `json:"move_id,omitempty"`
	MoveType     string `json:"move_type,omitempty"`
	Steer        string `json:"steer,omitempty"` // redirect: joins the thread on replay
	NewMoveID    string `json:"new_move_id,omitempty"`
	NewVersionID string `json:"new_version_id,omitempty"`
	AutonomyDial bool   `json:"autonomy_dial"`
}

type overridePayload struct {
	ProposalID string   `json:"proposal_id"`
	Verb       string   `json:"verb"`
	Reasons    []string `json:"reasons"`
	RuleIDs    []string `json:"rule_ids"`
}

type autoAdvancedPayload struct {
	MoveID       string `json:"move_id"`
	MoveType     string `json:"move_type"`
	ProposalID   string `json:"proposal_id"`
	NewVersionID string `json:"new_version_id"`
	AutonomyDial bool   `json:"autonomy_dial"`
}

// --- small helpers ---

func newID(prefix string) string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(fmt.Sprintf("orchestrator: crypto/rand: %v", err)) // unreachable on supported platforms
	}
	return prefix + "_" + hex.EncodeToString(b[:])
}

func first(ss []string) string {
	if len(ss) == 0 {
		return ""
	}
	return ss[0]
}

// clone deep-copies a Draft through JSON so mutations never alias the
// caller's slices.
func clone(d draft.Draft) draft.Draft {
	raw, err := json.Marshal(d)
	if err != nil {
		panic(fmt.Sprintf("orchestrator: marshal draft: %v", err)) // unreachable: Draft is plain data
	}
	var out draft.Draft
	if err := json.Unmarshal(raw, &out); err != nil {
		panic(fmt.Sprintf("orchestrator: unmarshal draft: %v", err)) // unreachable: input is json.Marshal output
	}
	return out
}
