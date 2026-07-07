package orchestrator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/grounding"
	"github.com/ogngnaoh/capycook/internal/llm"
	"github.com/ogngnaoh/capycook/internal/proposal"
	"github.com/ogngnaoh/capycook/internal/services"
	"github.com/ogngnaoh/capycook/internal/store"
)

const session = "sess-1"

// fakeLLM records every request and delegates to fn, or to the deterministic
// llm.Stub when fn is nil. Race tests swap in blocking fns.
type fakeLLM struct {
	mu   sync.Mutex
	fn   func(ctx context.Context, req llm.MoveRequest) (proposal.Proposal, error)
	reqs []llm.MoveRequest
}

func (f *fakeLLM) GenerateMove(ctx context.Context, req llm.MoveRequest) (proposal.Proposal, error) {
	f.mu.Lock()
	f.reqs = append(f.reqs, req)
	fn := f.fn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, req)
	}
	return llm.Stub{}.GenerateMove(ctx, req)
}

func (f *fakeLLM) setFn(fn func(ctx context.Context, req llm.MoveRequest) (proposal.Proposal, error)) {
	f.mu.Lock()
	f.fn = fn
	f.mu.Unlock()
}

func (f *fakeLLM) calls() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.reqs)
}

func (f *fakeLLM) request(t *testing.T, i int) llm.MoveRequest {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	if i >= len(f.reqs) {
		t.Fatalf("fakeLLM has %d requests, want index %d", len(f.reqs), i)
	}
	return f.reqs[i]
}

type env struct {
	st       *store.SQLite
	log      *eventlog.Log
	llm      *fakeLLM
	orch     *Orchestrator
	outcomes chan Outcome
}

func newEnv(t *testing.T) *env {
	t.Helper()
	return newEnvArm(t, "")
}

// newEnvArm is newEnv with an explicit eval arm ("" = operator default
// "none").
func newEnvArm(t *testing.T, arm string) *env {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "orch.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	e := &env{st: st, log: eventlog.New(st), llm: &fakeLLM{}, outcomes: make(chan Outcome, 32)}
	e.orch = New(Deps{
		Arm:               arm,
		Store:             st,
		Log:               e.log,
		LLM:               e.llm,
		Safety:            services.StubSafetyGate{},
		Nutrition:         services.StubNutrition{},
		Cost:              services.StubCost{},
		Grounding:         grounding.Stub{},
		CostCitation:      testCostCitation,
		NutritionCitation: testNutritionCitation,
		Notify:            func(o Outcome) { e.outcomes <- o },
	})
	return e
}

// Wiring-supplied deterministic-citation metadata (task 2.8): cmd/server
// fills these from the data assets' provenance; tests use marker values.
var (
	testCostCitation      = proposal.Citation{Source: "test-cost-table", Ref: "prices.csv@test", Date: "2026-07-01"}
	testNutritionCitation = proposal.Citation{Source: "test-usda", Ref: "nutrients.csv@test", Date: "2026-07-02"}
)

func testConstraints() draft.Constraints {
	return draft.Constraints{
		Dietary: []string{}, Allergens: []string{}, Equipment: []string{},
		Skill: "beginner", Servings: 2, OnHand: []string{}, Cuisine: "western",
	}
}

// emptyDraft mirrors what the orchestrator reconstructs for a dish with no
// version yet: a zero draft carrying the dish's constraints.
func emptyDraft() draft.Draft { return draft.Draft{Constraints: testConstraints()} }

// safeDraft is a small garlic-free draft used to seed a first version.
func safeDraft() draft.Draft {
	return draft.Draft{
		Title:   "Roast Carrot Plate",
		Concept: "sweet roast carrots with yogurt",
		Ingredients: []draft.Ingredient{
			{Name: "carrot", Qty: 1500, Unit: "g"},
			{Name: "olive oil", Qty: 30, Unit: "ml"},
		},
		Steps: []draft.Step{
			{Text: "Roast the carrots at 220C.", Technique: "roast", Why: "char concentrates sweetness"},
		},
		Constraints: testConstraints(),
	}
}

func (e *env) createDish(t *testing.T, id string, dial bool) {
	t.Helper()
	raw, err := json.Marshal(testConstraints())
	if err != nil {
		t.Fatalf("marshal constraints: %v", err)
	}
	err = e.st.CreateDish(context.Background(), store.Dish{
		ID: id, Seed: "charred carrots", ConstraintsJSON: string(raw), AutonomyDial: dial,
	})
	if err != nil {
		t.Fatalf("CreateDish: %v", err)
	}
}

// seedVersion stores d as a new version and points the dish at it.
func (e *env) seedVersion(t *testing.T, dishID string, d draft.Draft) string {
	t.Helper()
	ctx := context.Background()
	raw, err := json.Marshal(d)
	if err != nil {
		t.Fatalf("marshal draft: %v", err)
	}
	dish, err := e.st.GetDish(ctx, dishID)
	if err != nil {
		t.Fatalf("GetDish: %v", err)
	}
	id := fmt.Sprintf("seed-ver-%s-%d", dishID, time.Now().UnixNano())
	err = e.st.CreateVersion(ctx, store.Version{
		ID: id, DishID: dishID, ParentVersionID: dish.CurrentVersionID, DraftJSON: string(raw),
	})
	if err != nil {
		t.Fatalf("CreateVersion: %v", err)
	}
	dish.CurrentVersionID = &id
	if err := e.st.UpdateDish(ctx, dish); err != nil {
		t.Fatalf("UpdateDish: %v", err)
	}
	return id
}

func (e *env) waitOutcome(t *testing.T, kind string) Outcome {
	t.Helper()
	select {
	case o := <-e.outcomes:
		if o.Kind != kind {
			t.Fatalf("outcome kind = %q, want %q (outcome %+v)", o.Kind, kind, o)
		}
		return o
	case <-time.After(5 * time.Second):
		t.Fatalf("timed out waiting for %q outcome", kind)
	}
	return Outcome{}
}

func (e *env) events(t *testing.T, dishID string) []eventlog.Event {
	t.Helper()
	evs, err := e.log.Replay(context.Background(), dishID)
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	return evs
}

func (e *env) eventTypes(t *testing.T, dishID string) []string {
	t.Helper()
	evs := e.events(t, dishID)
	types := make([]string, len(evs))
	for i, ev := range evs {
		types[i] = ev.Type
	}
	return types
}

func countType(types []string, typ string) int {
	n := 0
	for _, tt := range types {
		if tt == typ {
			n++
		}
	}
	return n
}

func lastOfType(t *testing.T, evs []eventlog.Event, typ string) eventlog.Event {
	t.Helper()
	for i := len(evs) - 1; i >= 0; i-- {
		if evs[i].Type == typ {
			return evs[i]
		}
	}
	t.Fatalf("no %q event found", typ)
	return eventlog.Event{}
}

func payloadMap(t *testing.T, ev eventlog.Event) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(ev.Payload, &m); err != nil {
		t.Fatalf("unmarshal %s payload: %v", ev.Type, err)
	}
	return m
}

func (e *env) versionDraft(t *testing.T, versionID string) draft.Draft {
	t.Helper()
	v, err := e.st.GetVersion(context.Background(), versionID)
	if err != nil {
		t.Fatalf("GetVersion(%s): %v", versionID, err)
	}
	var d draft.Draft
	if err := json.Unmarshal([]byte(v.DraftJSON), &d); err != nil {
		t.Fatalf("unmarshal version draft: %v", err)
	}
	return d
}

// --- moves ---

func TestCreativeMoveReady(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	moveID, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeSeedExpand, "")
	if err != nil {
		t.Fatalf("Move: %v", err)
	}
	if moveID == "" {
		t.Fatal("Move returned empty move id")
	}
	out := e.waitOutcome(t, OutcomeReady)
	if out.DishID != "d1" || out.MoveID != moveID {
		t.Errorf("outcome dish/move = %q/%q, want d1/%q", out.DishID, out.MoveID, moveID)
	}
	if len(out.Proposals) != 1 {
		t.Fatalf("got %d proposals, want 1", len(out.Proposals))
	}
	p := out.Proposals[0]
	if p.ID == "" {
		t.Error("proposal has no id")
	}
	if p.MoveID != moveID {
		t.Errorf("proposal.MoveID = %q, want %q", p.MoveID, moveID)
	}
	if p.Safety.Status != "pass" {
		t.Errorf("proposal.Safety.Status = %q, want pass", p.Safety.Status)
	}
	st := e.orch.Status("d1")
	if st.State != StateAwaitingGate {
		t.Errorf("state = %q, want %q", st.State, StateAwaitingGate)
	}
	if len(st.Pending) != 1 || st.Pending[0].ID != p.ID {
		t.Errorf("Status.Pending = %+v, want the ready proposal", st.Pending)
	}
	want := []string{eventlog.TypeMoveRequested, eventlog.TypeProposalReady}
	if got := e.eventTypes(t, "d1"); !reflect.DeepEqual(got, want) {
		t.Errorf("event types = %v, want %v", got, want)
	}
}

func TestMoveUnknownType(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	if _, err := e.orch.Move(context.Background(), "d1", session, "julienne_everything", ""); !errors.Is(err, ErrUnknownMoveType) {
		t.Fatalf("err = %v, want ErrUnknownMoveType", err)
	}
	if got := e.eventTypes(t, "d1"); len(got) != 0 {
		t.Errorf("events after rejected move = %v, want none", got)
	}
}

func TestMoveMissingDish(t *testing.T) {
	e := newEnv(t)
	if _, err := e.orch.Move(context.Background(), "ghost", session, llm.MoveTypeSeedExpand, ""); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("err = %v, want store.ErrNotFound", err)
	}
}

func TestMoveSingleFlight(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	started := make(chan struct{})
	e.llm.setFn(func(ctx context.Context, req llm.MoveRequest) (proposal.Proposal, error) {
		close(started)
		<-ctx.Done()
		return proposal.Proposal{}, ctx.Err()
	})
	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeFlavorDirection, ""); err != nil {
		t.Fatalf("first Move: %v", err)
	}
	<-started
	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeTechniqueStep, ""); !errors.Is(err, ErrInFlight) {
		t.Fatalf("second Move err = %v, want ErrInFlight", err)
	}
	if st := e.orch.Status("d1"); st.State != StateProposing {
		t.Errorf("state = %q, want %q", st.State, StateProposing)
	}
	// Unblock and drop the in-flight generation so the store can close.
	if ok, err := e.orch.Cancel(context.Background(), "d1", session); !ok || err != nil {
		t.Fatalf("Cancel = %v, %v; want true, nil", ok, err)
	}
	e.waitOutcome(t, OutcomeCancelled)
}

func TestMoveWhileAwaitingGate(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeSeedExpand, ""); err != nil {
		t.Fatalf("Move: %v", err)
	}
	e.waitOutcome(t, OutcomeReady)
	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeTechniqueStep, ""); !errors.Is(err, ErrAwaitingGate) {
		t.Fatalf("Move while awaiting gate err = %v, want ErrAwaitingGate", err)
	}
}

// TestMoveEventFields checks the move_requested payload carries the move
// type and the steer verbatim, and that every event gets the caller's
// session id, arm "none", and run_kind "operator".
func TestMoveEventFields(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	steer := "  keep -- this text VERBATIM \n(punctuation and all)"
	moveID, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeFlavorDirection, steer)
	if err != nil {
		t.Fatalf("Move: %v", err)
	}
	e.waitOutcome(t, OutcomeReady)
	evs := e.events(t, "d1")
	if len(evs) == 0 {
		t.Fatal("no events")
	}
	for _, ev := range evs {
		if ev.SessionID != session || ev.Arm != "none" || ev.RunKind != "operator" {
			t.Errorf("event %s session/arm/run_kind = %q/%q/%q, want %q/none/operator",
				ev.Type, ev.SessionID, ev.Arm, ev.RunKind, session)
		}
	}
	p := payloadMap(t, lastOfType(t, evs, eventlog.TypeMoveRequested))
	if p["move_id"] != moveID || p["move_type"] != llm.MoveTypeFlavorDirection || p["steer"] != steer {
		t.Errorf("move_requested payload = %v, want move_id=%q move_type=%q steer=%q",
			p, moveID, llm.MoveTypeFlavorDirection, steer)
	}
}

func TestMoveFailed(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	e.llm.setFn(func(ctx context.Context, req llm.MoveRequest) (proposal.Proposal, error) {
		return proposal.Proposal{}, errors.New("model exploded")
	})
	moveID, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeSeedExpand, "")
	if err != nil {
		t.Fatalf("Move: %v", err)
	}
	out := e.waitOutcome(t, OutcomeFailed)
	if out.MoveID != moveID || out.Reason == "" {
		t.Errorf("failed outcome = %+v, want move %q with a reason", out, moveID)
	}
	evs := e.events(t, "d1")
	p := payloadMap(t, lastOfType(t, evs, eventlog.TypeMoveFailed))
	if p["move_id"] != moveID || p["reason"] != "model exploded" {
		t.Errorf("move_failed payload = %v", p)
	}
	if st := e.orch.Status("d1"); st.State != StateIdle {
		t.Errorf("state after failure = %q, want idle", st.State)
	}
	// failed → idle: a fresh move is allowed.
	e.llm.setFn(nil)
	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeSeedExpand, ""); err != nil {
		t.Fatalf("Move after failure: %v", err)
	}
	e.waitOutcome(t, OutcomeReady)
}

// --- safety block ---

func TestBlockedFlow(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	moveID, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeIngredientChange, "infuse a garlic oil for drizzling")
	if err != nil {
		t.Fatalf("Move: %v", err)
	}
	out := e.waitOutcome(t, OutcomeBlocked)
	if out.MoveID != moveID || out.RuleID != "anaerobic-garlic-oil" || out.Reason == "" {
		t.Errorf("blocked outcome = %+v, want move %q rule anaerobic-garlic-oil", out, moveID)
	}
	st := e.orch.Status("d1")
	if st.State != StateBlocked {
		t.Fatalf("state = %q, want %q", st.State, StateBlocked)
	}
	if st.BlockedMoveID != moveID || st.BlockedRuleID != "anaerobic-garlic-oil" {
		t.Errorf("Status blocked info = %+v", st)
	}
	if len(st.Pending) != 0 {
		t.Errorf("blocked proposal must be discarded, got pending %+v", st.Pending)
	}
	types := e.eventTypes(t, "d1")
	if countType(types, eventlog.TypeProposalReady) != 0 {
		t.Errorf("blocked move must emit no proposal_ready, events = %v", types)
	}
	p := payloadMap(t, lastOfType(t, e.events(t, "d1"), eventlog.TypeProposalBlocked))
	if p["move_id"] != moveID || p["rule_id"] != "anaerobic-garlic-oil" || p["reason"] == "" {
		t.Errorf("proposal_blocked payload = %v", p)
	}

	// Blocked state: only regenerate/redirect are allowed next.
	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeSeedExpand, ""); !errors.Is(err, ErrBlocked) {
		t.Errorf("Move in blocked state err = %v, want ErrBlocked", err)
	}
	if _, err := e.orch.Gate(context.Background(), GateRequest{DishID: "d1", SessionID: session, ProposalID: moveID, Verb: VerbAccept}); !errors.Is(err, ErrVerbNotAllowed) {
		t.Errorf("accept in blocked state err = %v, want ErrVerbNotAllowed", err)
	}
	if _, err := e.orch.Gate(context.Background(), GateRequest{DishID: "d1", SessionID: session, ProposalID: moveID, Verb: VerbAlternatives}); !errors.Is(err, ErrVerbNotAllowed) {
		t.Errorf("alternatives in blocked state err = %v, want ErrVerbNotAllowed", err)
	}
	if _, err := e.orch.Gate(context.Background(), GateRequest{DishID: "d1", SessionID: session, ProposalID: "pr_nope", Verb: VerbRegenerate}); !errors.Is(err, ErrUnknownProposal) {
		t.Errorf("regenerate with wrong id err = %v, want ErrUnknownProposal", err)
	}
}

// TestBlockedRegenerateStaysBlocked: regenerate is a pure re-sample with the
// original steer, so the seeded unsafe steer blocks again.
func TestBlockedRegenerateStaysBlocked(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	moveID, _ := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeIngredientChange, "make me a garlic oil")
	e.waitOutcome(t, OutcomeBlocked)
	res, err := e.orch.Gate(context.Background(), GateRequest{DishID: "d1", SessionID: session, ProposalID: moveID, Verb: VerbRegenerate})
	if err != nil {
		t.Fatalf("regenerate from blocked: %v", err)
	}
	if res.NewMoveID == "" || res.NewMoveID == moveID {
		t.Errorf("regenerate NewMoveID = %q, want a fresh move id", res.NewMoveID)
	}
	out := e.waitOutcome(t, OutcomeBlocked)
	if out.MoveID != res.NewMoveID {
		t.Errorf("re-blocked outcome move = %q, want %q", out.MoveID, res.NewMoveID)
	}
	if req := e.llm.request(t, 1); req.Steer != "make me a garlic oil" {
		t.Errorf("regenerate steer = %q, want the original steer", req.Steer)
	}
	if st := e.orch.Status("d1"); st.State != StateBlocked || st.BlockedMoveID != res.NewMoveID {
		t.Errorf("Status = %+v, want blocked on %q", st, res.NewMoveID)
	}
}

func TestBlockedRedirectRecovers(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	moveID, _ := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeIngredientChange, "make me a garlic oil")
	e.waitOutcome(t, OutcomeBlocked)
	res, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: moveID, Verb: VerbRedirect,
		Steer: "skip the oil, add lemon instead",
	})
	if err != nil {
		t.Fatalf("redirect from blocked: %v", err)
	}
	out := e.waitOutcome(t, OutcomeReady)
	if out.MoveID != res.NewMoveID {
		t.Errorf("ready outcome move = %q, want %q", out.MoveID, res.NewMoveID)
	}
	if req := e.llm.request(t, 1); req.Steer != "skip the oil, add lemon instead" {
		t.Errorf("redirect steer = %q, want the fresh steer", req.Steer)
	}
	if st := e.orch.Status("d1"); st.State != StateAwaitingGate {
		t.Errorf("state = %q, want awaiting_gate", st.State)
	}
}

// --- cancel ---

func TestCancelDuringProposing(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	started := make(chan struct{})
	e.llm.setFn(func(ctx context.Context, req llm.MoveRequest) (proposal.Proposal, error) {
		close(started)
		<-ctx.Done()
		return proposal.Proposal{}, ctx.Err()
	})
	moveID, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeSeedExpand, "")
	if err != nil {
		t.Fatalf("Move: %v", err)
	}
	<-started
	ok, err := e.orch.Cancel(context.Background(), "d1", session)
	if !ok || err != nil {
		t.Fatalf("Cancel = %v, %v; want true, nil", ok, err)
	}
	out := e.waitOutcome(t, OutcomeCancelled)
	if out.MoveID != moveID {
		t.Errorf("cancelled outcome move = %q, want %q", out.MoveID, moveID)
	}
	types := e.eventTypes(t, "d1")
	if countType(types, eventlog.TypeMoveCancelled) != 1 || countType(types, eventlog.TypeProposalReady) != 0 {
		t.Errorf("events = %v, want exactly one move_cancelled and no proposal_ready", types)
	}
	if st := e.orch.Status("d1"); st.State != StateIdle {
		t.Errorf("state = %q, want idle", st.State)
	}
	// cancelled → idle: a fresh move works.
	e.llm.setFn(nil)
	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeSeedExpand, ""); err != nil {
		t.Fatalf("Move after cancel: %v", err)
	}
	e.waitOutcome(t, OutcomeReady)
}

func TestCancelNoopOutsideProposing(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	if ok, err := e.orch.Cancel(context.Background(), "d1", session); ok || err != nil {
		t.Fatalf("Cancel while idle = %v, %v; want false, nil", ok, err)
	}
	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeSeedExpand, ""); err != nil {
		t.Fatalf("Move: %v", err)
	}
	e.waitOutcome(t, OutcomeReady)
	if ok, err := e.orch.Cancel(context.Background(), "d1", session); ok || err != nil {
		t.Fatalf("Cancel while awaiting gate = %v, %v; want false, nil", ok, err)
	}
	types := e.eventTypes(t, "d1")
	if countType(types, eventlog.TypeMoveCancelled) != 0 {
		t.Errorf("events = %v, want no move_cancelled", types)
	}
	if st := e.orch.Status("d1"); st.State != StateAwaitingGate || len(st.Pending) != 1 {
		t.Errorf("Status = %+v, want awaiting_gate with the pending proposal intact", st)
	}
}

// --- races ---

// TestRaceCancelBeatsProposal: cancel lands while the generation is in
// flight; the late generation result must be dropped silently.
func TestRaceCancelBeatsProposal(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	release := make(chan struct{})
	started := make(chan struct{})
	e.llm.setFn(func(ctx context.Context, req llm.MoveRequest) (proposal.Proposal, error) {
		close(started)
		<-release
		return llm.Stub{}.GenerateMove(context.Background(), req) // ignores cancellation on purpose
	})
	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeSeedExpand, ""); err != nil {
		t.Fatalf("Move: %v", err)
	}
	<-started
	if ok, _ := e.orch.Cancel(context.Background(), "d1", session); !ok {
		t.Fatal("Cancel returned false, want true")
	}
	e.waitOutcome(t, OutcomeCancelled)
	close(release) // the generation now completes — and must lose the race
	// The loser can never append: once cancel transitioned, the stale commit
	// is dropped under the same lock. Prove the dish is usable again.
	e.llm.setFn(nil)
	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeSeedExpand, ""); err != nil {
		t.Fatalf("Move after cancel: %v", err)
	}
	e.waitOutcome(t, OutcomeReady)
	types := e.eventTypes(t, "d1")
	if got := countType(types, eventlog.TypeProposalReady); got != 1 {
		t.Errorf("proposal_ready count = %d, want 1 (cancelled generation must not land)", got)
	}
	if got := countType(types, eventlog.TypeMoveCancelled); got != 1 {
		t.Errorf("move_cancelled count = %d, want 1", got)
	}
}

// TestRaceProposalBeatsCancel: the proposal lands first; the late cancel is
// a no-op and the pending proposal remains acceptable.
func TestRaceProposalBeatsCancel(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeSeedExpand, ""); err != nil {
		t.Fatalf("Move: %v", err)
	}
	out := e.waitOutcome(t, OutcomeReady)
	if ok, err := e.orch.Cancel(context.Background(), "d1", session); ok || err != nil {
		t.Fatalf("late Cancel = %v, %v; want false, nil (no-op)", ok, err)
	}
	if countType(e.eventTypes(t, "d1"), eventlog.TypeMoveCancelled) != 0 {
		t.Error("late cancel must append no move_cancelled event")
	}
	res, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: out.Proposals[0].ID, Verb: VerbAccept,
	})
	if err != nil || res.NewVersionID == "" {
		t.Fatalf("accept after no-op cancel = %+v, %v", res, err)
	}
}

// --- deterministic moves + autonomy dial ---

func TestAutoAdvanceDeterministicMoves(t *testing.T) {
	cases := []struct {
		moveType string
		steer    string
		check    func(t *testing.T, d draft.Draft)
	}{
		{llm.MoveTypeScaleServings, "8", func(t *testing.T, d draft.Draft) {
			if d.Constraints.Servings != 8 {
				t.Errorf("servings = %d, want 8", d.Constraints.Servings)
			}
			if d.Ingredients[0].Qty != 6000 {
				t.Errorf("carrot qty = %v, want 6000 (1500 × 4)", d.Ingredients[0].Qty)
			}
		}},
		{llm.MoveTypeUnitConvert, "", func(t *testing.T, d draft.Draft) {
			if d.Ingredients[0].Qty != 1.5 || d.Ingredients[0].Unit != "kg" {
				t.Errorf("carrot = %v %s, want 1.5 kg", d.Ingredients[0].Qty, d.Ingredients[0].Unit)
			}
			if d.Ingredients[1].Qty != 30 || d.Ingredients[1].Unit != "ml" {
				t.Errorf("olive oil = %v %s, want 30 ml untouched", d.Ingredients[1].Qty, d.Ingredients[1].Unit)
			}
		}},
		{llm.MoveTypeCostRecompute, "", func(t *testing.T, d draft.Draft) {
			if d.Analysis.Cost.TotalUSD != 12.4 || d.Analysis.Cost.PerServingUSD != 6.2 {
				t.Errorf("cost = %+v, want the services stub values", d.Analysis.Cost)
			}
		}},
		{llm.MoveTypeNutritionRecompute, "", func(t *testing.T, d draft.Draft) {
			if d.Analysis.Nutrition.Calories != 420 {
				t.Errorf("calories = %v, want 420 (services stub)", d.Analysis.Nutrition.Calories)
			}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.moveType, func(t *testing.T) {
			e := newEnv(t)
			e.createDish(t, "d1", true) // dial ON (default)
			e.seedVersion(t, "d1", safeDraft())
			moveID, err := e.orch.Move(context.Background(), "d1", session, tc.moveType, tc.steer)
			if err != nil {
				t.Fatalf("Move: %v", err)
			}
			out := e.waitOutcome(t, OutcomeAutoAdvanced)
			if out.MoveID != moveID || out.NewVersionID == "" {
				t.Fatalf("outcome = %+v, want move %q with a new version", out, moveID)
			}
			if len(out.Proposals) != 1 || out.Proposals[0].Confidence != 1.0 {
				t.Errorf("auto-advanced proposal = %+v, want confidence 1.0", out.Proposals)
			}
			if len(out.Proposals[0].Citations) == 0 {
				t.Error("deterministic proposal has no citations")
			}
			types := e.eventTypes(t, "d1")
			want := []string{eventlog.TypeMoveRequested, eventlog.TypeMoveAutoAdvanced}
			if !reflect.DeepEqual(types, want) {
				t.Errorf("event types = %v, want %v (never gate_accept)", types, want)
			}
			p := payloadMap(t, lastOfType(t, e.events(t, "d1"), eventlog.TypeMoveAutoAdvanced))
			if p["autonomy_dial"] != true || p["new_version_id"] != out.NewVersionID || p["move_type"] != tc.moveType {
				t.Errorf("move_auto_advanced payload = %v", p)
			}
			dish, err := e.st.GetDish(context.Background(), "d1")
			if err != nil {
				t.Fatalf("GetDish: %v", err)
			}
			if dish.CurrentVersionID == nil || *dish.CurrentVersionID != out.NewVersionID {
				t.Errorf("dish current version = %v, want %q", dish.CurrentVersionID, out.NewVersionID)
			}
			if st := e.orch.Status("d1"); st.State != StateIdle {
				t.Errorf("state = %q, want idle after auto-advance", st.State)
			}
			tc.check(t, e.versionDraft(t, out.NewVersionID))
		})
	}
}

// TestDeterministicDialOff: with the dial off a deterministic move becomes a
// normal pending proposal and resolves through gate_accept.
func TestDeterministicDialOff(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", false)
	e.seedVersion(t, "d1", safeDraft())
	moveID, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeNutritionRecompute, "")
	if err != nil {
		t.Fatalf("Move: %v", err)
	}
	out := e.waitOutcome(t, OutcomeReady)
	if out.MoveID != moveID || len(out.Proposals) != 1 || out.Proposals[0].Confidence != 1.0 {
		t.Fatalf("outcome = %+v, want one confidence-1.0 pending proposal", out)
	}
	if st := e.orch.Status("d1"); st.State != StateAwaitingGate {
		t.Fatalf("state = %q, want awaiting_gate", st.State)
	}
	res, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: out.Proposals[0].ID, Verb: VerbAccept,
	})
	if err != nil {
		t.Fatalf("accept: %v", err)
	}
	types := e.eventTypes(t, "d1")
	if countType(types, eventlog.TypeMoveAutoAdvanced) != 0 || countType(types, eventlog.TypeGateAccept) != 1 {
		t.Errorf("event types = %v, want gate_accept and no move_auto_advanced", types)
	}
	p := payloadMap(t, lastOfType(t, e.events(t, "d1"), eventlog.TypeGateAccept))
	if p["autonomy_dial"] != false {
		t.Errorf("gate_accept payload autonomy_dial = %v, want false", p["autonomy_dial"])
	}
	if got := e.versionDraft(t, res.NewVersionID).Analysis.Nutrition.Calories; got != 420 {
		t.Errorf("accepted nutrition calories = %v, want 420", got)
	}
}

// --- grounding resolution + deterministic citations (task 2.8) ---

func ingredientByName(t *testing.T, d draft.Draft, name string) draft.Ingredient {
	t.Helper()
	for _, ing := range d.Ingredients {
		if ing.Name == name {
			return ing
		}
	}
	t.Fatalf("ingredient %q not in draft: %+v", name, d.Ingredients)
	return draft.Ingredient{}
}

// TestProposalChangeCarriesResolvedIDs: proposal ops are re-diffed after
// grounding resolution BEFORE the safety screen runs, so the allergen check
// keys on FDC/FoodOn ids (aliases resolve via grounding, not the gate).
// Unresolvable names keep nil ids — the gate stays fail-closed on them.
func TestProposalChangeCarriesResolvedIDs(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	p := readyProposal(t, e, "d1", llm.MoveTypeSeedExpand, "")
	proposed, err := emptyDraft().Apply(p.Change)
	if err != nil {
		t.Fatalf("apply proposal change: %v", err)
	}
	oil := ingredientByName(t, proposed, "olive oil")
	if oil.FDCID == nil || *oil.FDCID != "fdc-1750351" {
		t.Errorf("olive oil FDCID = %v, want the grounding stub's fdc-1750351", oil.FDCID)
	}
	if oil.FoodOnID == nil || *oil.FoodOnID != "FOODON_03305263" {
		t.Errorf("olive oil FoodOnID = %v, want FOODON_03305263", oil.FoodOnID)
	}
	parsley := ingredientByName(t, proposed, "flat-leaf parsley")
	if parsley.FDCID != nil || parsley.FoodOnID != nil {
		t.Errorf("unresolvable ingredient ids = %v/%v, want nil/nil", parsley.FDCID, parsley.FoodOnID)
	}
}

// TestAcceptSnapshotCarriesResolvedIDs: the accepted version's snapshot
// keeps the resolved ids, so later nutrition/allergen lookups key on them.
func TestAcceptSnapshotCarriesResolvedIDs(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	p := readyProposal(t, e, "d1", llm.MoveTypeSeedExpand, "")
	res, err := e.orch.Gate(context.Background(), GateRequest{
		DishID: "d1", SessionID: session, ProposalID: p.ID, Verb: VerbAccept,
	})
	if err != nil {
		t.Fatalf("accept: %v", err)
	}
	d := e.versionDraft(t, res.NewVersionID)
	oil := ingredientByName(t, d, "olive oil")
	if oil.FDCID == nil || *oil.FDCID != "fdc-1750351" {
		t.Errorf("snapshot olive oil FDCID = %v, want fdc-1750351", oil.FDCID)
	}
	parsley := ingredientByName(t, d, "flat-leaf parsley")
	if parsley.FDCID != nil || parsley.FoodOnID != nil {
		t.Errorf("snapshot unresolvable ids = %v/%v, want nil/nil", parsley.FDCID, parsley.FoodOnID)
	}
}

// TestDeterministicCitationsFromWiring: deterministic recomputes cite the
// wiring-supplied provenance — the cost-table citation verbatim; nutrition's
// base citation plus one deterministic fdc citation per resolvable
// ingredient (never a fabricated id).
func TestDeterministicCitationsFromWiring(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	e.seedVersion(t, "d1", safeDraft())

	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeNutritionRecompute, ""); err != nil {
		t.Fatalf("Move(nutrition_recompute): %v", err)
	}
	out := e.waitOutcome(t, OutcomeAutoAdvanced)
	cites := out.Proposals[0].Citations
	if len(cites) == 0 || cites[0] != testNutritionCitation {
		t.Fatalf("nutrition citations = %+v, want the wired base citation first", cites)
	}
	wantRefs := map[string]bool{ // safeDraft: carrot + olive oil, both stub-resolvable
		"fdc:fdc-2258586 (carrot)":    false,
		"fdc:fdc-1750351 (olive oil)": false,
	}
	for _, c := range cites[1:] {
		if _, ok := wantRefs[c.Ref]; ok {
			wantRefs[c.Ref] = true
		}
	}
	for ref, seen := range wantRefs {
		if !seen {
			t.Errorf("nutrition citations missing %q: %+v", ref, cites)
		}
	}

	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeCostRecompute, ""); err != nil {
		t.Fatalf("Move(cost_recompute): %v", err)
	}
	out = e.waitOutcome(t, OutcomeAutoAdvanced)
	if cites := out.Proposals[0].Citations; len(cites) != 1 || cites[0] != testCostCitation {
		t.Errorf("cost citations = %+v, want exactly the wired cost-table citation", cites)
	}
}

// --- thread rebuild ---

func TestThreadRebuiltFromEvents(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	ctx := context.Background()

	// m1: steered move, accepted.
	if _, err := e.orch.Move(ctx, "d1", session, llm.MoveTypeFlavorDirection, "more smoke"); err != nil {
		t.Fatalf("m1: %v", err)
	}
	out := e.waitOutcome(t, OutcomeReady)
	if _, err := e.orch.Gate(ctx, GateRequest{DishID: "d1", SessionID: session, ProposalID: out.Proposals[0].ID, Verb: VerbAccept}); err != nil {
		t.Fatalf("accept m1: %v", err)
	}
	// m2: steered move, then redirected.
	if _, err := e.orch.Move(ctx, "d1", session, llm.MoveTypeIngredientChange, "swap to shallot"); err != nil {
		t.Fatalf("m2: %v", err)
	}
	out = e.waitOutcome(t, OutcomeReady)
	if _, err := e.orch.Gate(ctx, GateRequest{DishID: "d1", SessionID: session, ProposalID: out.Proposals[0].ID, Verb: VerbRedirect, Steer: "actually lean sweet"}); err != nil {
		t.Fatalf("redirect m2: %v", err)
	}
	out = e.waitOutcome(t, OutcomeReady)
	if _, err := e.orch.Gate(ctx, GateRequest{DishID: "d1", SessionID: session, ProposalID: out.Proposals[0].ID, Verb: VerbAccept}); err != nil {
		t.Fatalf("accept redirected m2: %v", err)
	}
	// m3: the thread now carries all three steers.
	if _, err := e.orch.Move(ctx, "d1", session, llm.MoveTypeTechniqueStep, "finish hot"); err != nil {
		t.Fatalf("m3: %v", err)
	}
	e.waitOutcome(t, OutcomeReady)

	// Request 2 is the redirect-spawned generation: thread = history before
	// it, current steer separate.
	redirected := e.llm.request(t, 2)
	if redirected.Steer != "actually lean sweet" {
		t.Errorf("redirected Steer = %q", redirected.Steer)
	}
	wantThread := []llm.ThreadTurn{{Role: "cook", Text: "more smoke"}, {Role: "cook", Text: "swap to shallot"}}
	if !reflect.DeepEqual(redirected.Thread, wantThread) {
		t.Errorf("redirected Thread = %+v, want %+v", redirected.Thread, wantThread)
	}
	final := e.llm.request(t, 3)
	wantThread = append(wantThread, llm.ThreadTurn{Role: "cook", Text: "actually lean sweet"})
	if !reflect.DeepEqual(final.Thread, wantThread) {
		t.Errorf("final Thread = %+v, want %+v", final.Thread, wantThread)
	}
}

func TestThreadCapsAtFiftyTurns(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	ctx := context.Background()
	for i := 1; i <= 60; i++ {
		payload, _ := json.Marshal(map[string]string{"steer": fmt.Sprintf("s%02d", i)})
		err := e.log.Append(ctx, eventlog.Event{
			DishID: "d1", SessionID: session, Type: eventlog.TypeMoveRequested,
			Payload: payload, Arm: "none", RunKind: "operator",
		})
		if err != nil {
			t.Fatalf("append: %v", err)
		}
	}
	if _, err := e.orch.Move(ctx, "d1", session, llm.MoveTypeSeedExpand, "now"); err != nil {
		t.Fatalf("Move: %v", err)
	}
	e.waitOutcome(t, OutcomeReady)
	thread := e.llm.request(t, 0).Thread
	if len(thread) != 50 {
		t.Fatalf("thread length = %d, want 50", len(thread))
	}
	if thread[0].Text != "s11" || thread[49].Text != "s60" {
		t.Errorf("thread window = %q..%q, want s11..s60", thread[0].Text, thread[49].Text)
	}
}

// --- restart + status ---

func TestStatusUnknownDishIsIdle(t *testing.T) {
	e := newEnv(t)
	if st := e.orch.Status("never-seen"); st.State != StateIdle || len(st.Pending) != 0 {
		t.Errorf("Status = %+v, want idle and empty", st)
	}
}

// TestRestartLosesPendingByDesign: gate state lives in server memory only —
// a new orchestrator over the same store starts idle, while events and
// versions persist.
func TestRestartLosesPendingByDesign(t *testing.T) {
	e := newEnv(t)
	e.createDish(t, "d1", true)
	if _, err := e.orch.Move(context.Background(), "d1", session, llm.MoveTypeSeedExpand, ""); err != nil {
		t.Fatalf("Move: %v", err)
	}
	e.waitOutcome(t, OutcomeReady)
	restarted := New(Deps{
		Store: e.st, Log: e.log, LLM: e.llm,
		Safety: services.StubSafetyGate{}, Nutrition: services.StubNutrition{}, Cost: services.StubCost{},
		Grounding: grounding.Stub{},
	})
	if st := restarted.Status("d1"); st.State != StateIdle || len(st.Pending) != 0 {
		t.Errorf("Status after restart = %+v, want idle with no pending", st)
	}
	if types := e.eventTypes(t, "d1"); countType(types, eventlog.TypeProposalReady) != 1 {
		t.Errorf("events must persist across restart, got %v", types)
	}
}
