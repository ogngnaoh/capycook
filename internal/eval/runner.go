package eval

// This file is the plan-4.3 scripted arm runner (spec §7 "Scripted arm
// runner"): every benchmark seed runs one fixed, versioned move script
// (eval/fixtures/move_script.json) identically per PREREG §4 arm through the
// REAL orchestrator — the runner is a harness around the same state machine
// normal operation uses, never a re-implementation. Every event it causes is
// stamped run_kind=harness + the arm, which is exactly what the H2 fold
// (replay.go) excludes from gate dynamics. After each arm's run the accepted
// version drafts and proposals are walked and exported as claims (the spec §7
// claim unit: flavor_rationale[].claim + unverified[] entries), each labeled
// at add-time by the Tier-1 verifier (VerifyTier1) against the evidence
// re-derived for the move that introduced it. The Amendment-1 stop-line:
// label_r1/label_r2 only ever come from the author and the judge — never from
// this code. label_tier1 is machine-written by the Tier-1 verifier.

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/grounding"
	"github.com/ogngnaoh/capycook/internal/llm"
	"github.com/ogngnaoh/capycook/internal/orchestrator"
	"github.com/ogngnaoh/capycook/internal/proposal"
	"github.com/ogngnaoh/capycook/internal/store"
)

// Arms are the three PREREG §4 eval arms in report order — the only arm
// values a harness run may use ("none" is the operator stamp, spec §4).
var Arms = []string{llm.ArmUngrounded, llm.ArmFlavorgraph, llm.ArmGrounded}

// OnBlockedAbort is the only pinned on_blocked policy: a safety block ends
// the seed's run with an error — the harness never routes around the gate.
const OnBlockedAbort = "abort"

// Seed is one benchmark seed: a dish idea plus its typed constraints. The
// real proposed seeds live in docs/archive/01-end-to-end/proposed-benchmark-seeds.json
// until Gate C ratification (plan 4.5); tests use synthetic seeds from
// internal/eval/testdata.
type Seed struct {
	ID          string            `json:"id"`
	Seed        string            `json:"seed"`
	Constraints draft.Constraints `json:"constraints"`
}

// seedsFile is the documented-draft file shape (inline comment/procedure
// notes wrapping the list — the dev_seeds.json family); LoadSeeds accepts it
// alongside a bare []Seed array.
type seedsFile struct {
	Seeds []Seed `json:"seeds"`
}

// LoadSeeds reads a seed list — a bare JSON array or the wrapped
// documented-draft shape — requiring non-empty unique ids and seed text.
func LoadSeeds(path string) ([]Seed, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("eval: read seeds: %w", err)
	}
	var seeds []Seed
	if err := json.Unmarshal(raw, &seeds); err != nil {
		var wrapped seedsFile
		if json.Unmarshal(raw, &wrapped) != nil || wrapped.Seeds == nil {
			return nil, fmt.Errorf("eval: parse seeds %s: %w", path, err)
		}
		seeds = wrapped.Seeds
	}
	if len(seeds) == 0 {
		return nil, fmt.Errorf("eval: seeds %s: empty list", path)
	}
	seen := make(map[string]bool, len(seeds))
	for i, s := range seeds {
		if s.ID == "" || strings.TrimSpace(s.Seed) == "" {
			return nil, fmt.Errorf("eval: seeds %s: entry %d: id and seed are required", path, i+1)
		}
		if seen[s.ID] {
			return nil, fmt.Errorf("eval: seeds %s: duplicate id %q", path, s.ID)
		}
		seen[s.ID] = true
	}
	return seeds, nil
}

// ScriptMove is one scripted move: a fixed move type and steer.
type ScriptMove struct {
	MoveType string `json:"move_type"`
	Steer    string `json:"steer"`
}

// ScriptPolicy is the script's gate policy. Verb "accept" (gate every
// proposal with accept, first card) and OnBlocked "abort" are the only
// supported values — the policy is part of the pinned instrument, not a
// runtime knob.
type ScriptPolicy struct {
	Verb      string `json:"verb"`
	OnBlocked string `json:"on_blocked"`
}

// Script is the versioned move-script instrument
// (eval/fixtures/move_script.json).
type Script struct {
	Version int          `json:"version"`
	Comment string       `json:"comment"`
	Policy  ScriptPolicy `json:"policy"`
	Moves   []ScriptMove `json:"moves"`
}

// LoadScript reads and validates a move script.
func LoadScript(path string) (Script, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Script{}, fmt.Errorf("eval: read move script: %w", err)
	}
	var s Script
	if err := json.Unmarshal(raw, &s); err != nil {
		return Script{}, fmt.Errorf("eval: parse move script %s: %w", path, err)
	}
	if err := s.Validate(); err != nil {
		return Script{}, fmt.Errorf("eval: move script %s: %w", path, err)
	}
	return s, nil
}

// Validate checks the script against the pinned instrument contract.
func (s Script) Validate() error {
	if s.Version < 1 {
		return errors.New("eval: move script: version must be >= 1")
	}
	if len(s.Moves) == 0 {
		return errors.New("eval: move script: at least one move is required")
	}
	if s.Policy.Verb != orchestrator.VerbAccept {
		return fmt.Errorf("eval: move script: unsupported policy verb %q (auto-accept is the only pinned policy)", s.Policy.Verb)
	}
	if s.Policy.OnBlocked != OnBlockedAbort {
		return fmt.Errorf("eval: move script: unsupported on_blocked %q (abort is the only pinned policy)", s.Policy.OnBlocked)
	}
	for i, m := range s.Moves {
		if _, ok := MoveRollup[m.MoveType]; !ok {
			return fmt.Errorf("eval: move script: move %d: unknown move type %q", i+1, m.MoveType)
		}
	}
	return nil
}

// Runner drives the scripted harness. Deps supplies the shared edges (store,
// eventlog, LLM, services, grounding); Arm, RunKind, and Notify on it are
// owned by the runner and overwritten per arm.
type Runner struct {
	Deps    orchestrator.Deps
	Script  Script
	Seeds   []Seed
	OutDir  string        // claims_<arm>.jsonl lands here (eval/out in real runs, gitignored)
	Timeout time.Duration // per-move outcome wait; <=0 means 30s
}

// Run executes the script for every seed under each requested arm (nil/empty
// = all three eval arms) and writes one claims_<arm>.jsonl per completed arm.
// It returns the exported claims per arm. Any blocked or failed move aborts
// the whole run with an error and leaves that arm's file unwritten — partial
// exports are never presented as a completed run.
func (r Runner) Run(ctx context.Context, arms []string) (map[string][]Claim, error) {
	if len(arms) == 0 {
		arms = Arms
	}
	for _, arm := range arms {
		if !isEvalArm(arm) {
			return nil, fmt.Errorf("eval: %q is not an eval arm (want one of %s)", arm, strings.Join(Arms, "|"))
		}
	}
	if err := r.Script.Validate(); err != nil {
		return nil, err
	}
	if len(r.Seeds) == 0 {
		return nil, errors.New("eval: runner: no seeds")
	}
	byArm := make(map[string][]Claim, len(arms))
	for _, arm := range arms {
		claims, err := r.runArm(ctx, arm)
		if err != nil {
			return nil, fmt.Errorf("eval: arm %s: %w", arm, err)
		}
		if err := WriteClaims(filepath.Join(r.OutDir, "claims_"+arm+".jsonl"), claims); err != nil {
			return nil, err
		}
		byArm[arm] = claims
	}
	return byArm, nil
}

// runArm builds one real orchestrator configured for the arm with
// run_kind=harness and runs every seed through the script sequentially.
func (r Runner) runArm(ctx context.Context, arm string) ([]Claim, error) {
	// Buffered well past the single outstanding move so a late generation
	// goroutine can never block on a run the harness already abandoned.
	outcomes := make(chan orchestrator.Outcome, 16)
	deps := r.Deps
	deps.Arm = arm
	deps.RunKind = RunKindHarness
	deps.Notify = func(o orchestrator.Outcome) { outcomes <- o }
	orch := orchestrator.New(deps)

	var claims []Claim
	for _, seed := range r.Seeds {
		run, err := r.runSeed(ctx, orch, deps, arm, seed, outcomes)
		if err != nil {
			return nil, fmt.Errorf("seed %s: %w", seed.ID, err)
		}
		claims = append(claims, extractClaims(arm, seed, run, deps.Grounding)...)
	}
	return claims, nil
}

// seedRun is one seed's completed script run: the pre-move initial draft
// (constraints only, no accepted moves yet — the ground truth the first
// move's evidence is re-derived against), the accepted proposals, and the
// version snapshots they produced, in move order.
type seedRun struct {
	initial   draft.Draft
	proposals []proposal.Proposal
	versions  []draft.Draft
}

// dishCreatedPayload mirrors httpapi's dish_created payload so harness dishes
// replay exactly like operator dishes.
type dishCreatedPayload struct {
	Seed         string            `json:"seed"`
	AutonomyDial bool              `json:"autonomy_dial"`
	Constraints  draft.Constraints `json:"constraints"`
}

// runSeed creates the seed's dish and drives the script's moves through the
// orchestrator, auto-accepting per policy. Deterministic moves auto-advance
// under the dial (ON for harness dishes); either path yields one accepted
// proposal and one new version per move.
func (r Runner) runSeed(ctx context.Context, orch *orchestrator.Orchestrator, deps orchestrator.Deps, arm string, seed Seed, outcomes <-chan orchestrator.Outcome) (seedRun, error) {
	dishID := newID("hdish")
	sessionID := newID("hsess")
	rawConstraints, err := json.Marshal(seed.Constraints)
	if err != nil {
		return seedRun{}, fmt.Errorf("marshal constraints: %w", err)
	}
	if err := deps.Store.CreateDish(ctx, store.Dish{
		ID: dishID, Seed: seed.Seed, ConstraintsJSON: string(rawConstraints), AutonomyDial: true,
	}); err != nil {
		return seedRun{}, fmt.Errorf("create dish: %w", err)
	}
	rawPayload, err := json.Marshal(dishCreatedPayload{Seed: seed.Seed, AutonomyDial: true, Constraints: seed.Constraints})
	if err != nil {
		return seedRun{}, fmt.Errorf("marshal dish_created payload: %w", err)
	}
	if err := deps.Log.Append(ctx, eventlog.Event{
		DishID: dishID, SessionID: sessionID, Type: eventlog.TypeDishCreated,
		Payload: rawPayload, Arm: arm, RunKind: RunKindHarness,
	}); err != nil {
		return seedRun{}, fmt.Errorf("append dish_created: %w", err)
	}

	// The pre-move draft: an empty draft carrying only the dish's constraints
	// — exactly what orchestrator.currentDraft hands the first move before
	// any version exists, so evidence re-derived against it matches what the
	// real orchestrator supplied when generating that move.
	run := seedRun{initial: draft.Draft{Constraints: seed.Constraints}}
	for i, mv := range r.Script.Moves {
		moveID, err := orch.Move(ctx, dishID, sessionID, mv.MoveType, mv.Steer)
		if err != nil {
			return seedRun{}, fmt.Errorf("move %d (%s): %w", i+1, mv.MoveType, err)
		}
		out, err := r.waitOutcome(ctx, outcomes, moveID)
		if err != nil {
			return seedRun{}, fmt.Errorf("move %d (%s): %w", i+1, mv.MoveType, err)
		}
		var prop proposal.Proposal
		var versionID string
		switch out.Kind {
		case orchestrator.OutcomeReady:
			// Auto-accept policy: gate the first card with verb accept.
			prop = out.Proposals[0]
			res, err := orch.Gate(ctx, orchestrator.GateRequest{
				DishID: dishID, SessionID: sessionID,
				ProposalID: prop.ID, Verb: orchestrator.VerbAccept,
			})
			if err != nil {
				return seedRun{}, fmt.Errorf("move %d (%s): accept: %w", i+1, mv.MoveType, err)
			}
			versionID = res.NewVersionID
		case orchestrator.OutcomeAutoAdvanced:
			prop = out.Proposals[0]
			versionID = out.NewVersionID
		case orchestrator.OutcomeBlocked:
			// Policy on_blocked=abort: the block stays in the eventlog as
			// real harness telemetry; the run itself ends here.
			return seedRun{}, fmt.Errorf("move %d (%s): proposal blocked (%s / %s); script policy aborts the run",
				i+1, mv.MoveType, out.Reason, out.RuleID)
		default:
			return seedRun{}, fmt.Errorf("move %d (%s): unexpected outcome %q (%s)", i+1, mv.MoveType, out.Kind, out.Reason)
		}
		d, err := loadVersionDraft(ctx, deps.Store, versionID)
		if err != nil {
			return seedRun{}, fmt.Errorf("move %d (%s): %w", i+1, mv.MoveType, err)
		}
		run.proposals = append(run.proposals, prop)
		run.versions = append(run.versions, d)
	}
	return run, nil
}

// waitOutcome waits for the move's Notify outcome. The harness runs one move
// at a time, so an outcome for any other move id is a hard error.
func (r Runner) waitOutcome(ctx context.Context, outcomes <-chan orchestrator.Outcome, moveID string) (orchestrator.Outcome, error) {
	timeout := r.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case out := <-outcomes:
		if out.MoveID != moveID {
			return orchestrator.Outcome{}, fmt.Errorf("outcome for move %s arrived while waiting for %s", out.MoveID, moveID)
		}
		return out, nil
	case <-timer.C:
		return orchestrator.Outcome{}, fmt.Errorf("timed out after %s waiting for move %s", timeout, moveID)
	case <-ctx.Done():
		return orchestrator.Outcome{}, ctx.Err()
	}
}

func loadVersionDraft(ctx context.Context, st store.Store, versionID string) (draft.Draft, error) {
	v, err := st.GetVersion(ctx, versionID)
	if err != nil {
		return draft.Draft{}, fmt.Errorf("load version %s: %w", versionID, err)
	}
	var d draft.Draft
	if err := json.Unmarshal([]byte(v.DraftJSON), &d); err != nil {
		return draft.Draft{}, fmt.Errorf("parse version %s draft: %w", versionID, err)
	}
	return d, nil
}

// extractClaims walks the run's accepted version drafts and proposals in move
// order and emits one Claim per distinct structured entry (spec §7 claim
// unit): each flavor_rationale[] entry (source = its provenance; empty means
// it surfaced [unverified]) and each proposal unverified[] entry (source
// always empty). Each claim is labeled at add-time via VerifyTier1 against the
// evidence re-derived for the move that introduced it — llm.BuildEvidence(arm,
// prev, g) where prev is the draft immediately before that move (run.initial,
// the pre-move seed draft, for the first move). Duplicate (text, source)
// pairs within the dish collapse to one claim, keeping the label from the
// move that introduced them (first-occurrence wins). The Amendment-1
// stop-line: label_r1/label_r2 only ever come from the author and the judge —
// never from this code. label_tier1 is machine-written by the Tier-1
// verifier.
func extractClaims(arm string, seed Seed, run seedRun, g grounding.Grounding) []Claim {
	type key struct{ text, source string }
	seen := map[key]bool{}
	var claims []Claim
	add := func(text, source string, ev llm.Evidence) {
		k := key{text, source}
		if text == "" || seen[k] {
			return
		}
		seen[k] = true
		claims = append(claims, Claim{
			ClaimID:    fmt.Sprintf("clm-%s-%s-%03d", arm, seed.ID, len(claims)+1),
			Arm:        arm,
			Dish:       seed.ID,
			Text:       text,
			Source:     source,
			LabelTier1: VerifyTier1(source, ev),
		})
	}
	prev := run.initial
	for i := range run.versions {
		ev := llm.BuildEvidence(arm, prev, g)
		for _, fc := range run.versions[i].FlavorRationale {
			source := ""
			if fc.Provenance != nil {
				source = *fc.Provenance
			}
			add(fc.Claim, source, ev)
		}
		for _, u := range run.proposals[i].Unverified {
			add(u, "", ev)
		}
		prev = run.versions[i]
	}
	return claims
}

// WriteClaims writes claims as JSONL to path, creating parent directories and
// truncating any previous file — each harness run re-exports in full.
func WriteClaims(path string, claims []Claim) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("eval: create claims dir: %w", err)
	}
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("eval: create claims file: %w", err)
	}
	w := bufio.NewWriter(f)
	for _, c := range claims {
		raw, err := json.Marshal(c)
		if err != nil {
			f.Close()
			return fmt.Errorf("eval: marshal claim %s: %w", c.ClaimID, err)
		}
		w.Write(raw)
		w.WriteByte('\n')
	}
	if err := w.Flush(); err != nil {
		f.Close()
		return fmt.Errorf("eval: write claims %s: %w", path, err)
	}
	if err := f.Close(); err != nil {
		return fmt.Errorf("eval: close claims %s: %w", path, err)
	}
	return nil
}

// RatesTable renders per-arm §7a rates as a paste-ready markdown table with
// the explicit denominators PREREG §5 requires (never a bare %). Arms print
// in sorted order; 4.4's report subcommand renders through this.
func RatesTable(rates map[string]ArmRates) string {
	arms := make([]string, 0, len(rates))
	for arm := range rates {
		arms = append(arms, arm)
	}
	sort.Strings(arms)
	var b strings.Builder
	b.WriteString("| arm | claims | unlabeled | checkable | excluded | provenance | mischaracterization | hallucination |\n")
	b.WriteString("|---|---|---|---|---|---|---|---|\n")
	for _, arm := range arms {
		r := rates[arm]
		fmt.Fprintf(&b, "| %s | %d | %d | %d | %d | %.3f | %.3f | %.3f |\n",
			r.Arm, r.Total, r.Unlabeled, r.Checkable, r.Excluded,
			r.Provenance, r.Mischaracterization, r.Hallucination)
	}
	return b.String()
}

func isEvalArm(arm string) bool {
	for _, a := range Arms {
		if a == arm {
			return true
		}
	}
	return false
}

func newID(prefix string) string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(fmt.Sprintf("eval: crypto/rand: %v", err)) // unreachable on supported platforms
	}
	return prefix + "_" + hex.EncodeToString(b[:])
}
