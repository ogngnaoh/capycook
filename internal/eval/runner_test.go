package eval

// Tests for the plan-4.3 scripted arm runner. The runner is exercised against
// the REAL orchestrator wired over the real deterministic services and the
// committed data/ assets, with the deterministic stub LLM (no live calls in
// phase 4). Seeds come from internal/eval/testdata (synthetic instrument-test
// data only — never eval/fixtures). The end-to-end test is the Amendment-1
// dry-run oracle: a 3-arm dry run must emit structurally-complete claims
// files whose every row carries a machine-written label_tier1 (this pinned
// script/stub combination never falls through to Tier 2) and never a human
// label — label_r1/label_r2 stay empty everywhere.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/eventlog"
	"github.com/ogngnaoh/capycook/internal/grounding"
	"github.com/ogngnaoh/capycook/internal/llm"
	"github.com/ogngnaoh/capycook/internal/orchestrator"
	"github.com/ogngnaoh/capycook/internal/proposal"
	"github.com/ogngnaoh/capycook/internal/services"
	"github.com/ogngnaoh/capycook/internal/store"
)

const (
	scriptPath = "../../eval/fixtures/move_script.json"
	seedsPath  = "testdata/seeds_synthetic.json"
)

func dataPath(rel string) string { return filepath.Join("..", "..", "data", rel) }

// realDeps wires the real deterministic services + grounding over the
// committed data/ assets and the stub LLM onto a t.TempDir() SQLite store —
// the same wiring cmd/server uses, minus the live-LLM branch.
func realDeps(t *testing.T) orchestrator.Deps {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "eval.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	nutrition, err := services.NewUSDANutrition(dataPath("usda/nutrients.csv"), dataPath("usda/portions.csv"))
	if err != nil {
		t.Fatalf("NewUSDANutrition: %v", err)
	}
	cost, err := services.NewTableCost(dataPath("cost/prices.csv"), dataPath("usda/portions.csv"))
	if err != nil {
		t.Fatalf("NewTableCost: %v", err)
	}
	allergen, err := services.NewAllergenChecker(dataPath("foodon/allergens.csv"))
	if err != nil {
		t.Fatalf("NewAllergenChecker: %v", err)
	}
	safety, err := services.NewSafetyGate(
		dataPath("safety/min_temps.csv"),
		dataPath("safety/anaerobic_lexicon.csv"),
		dataPath("safety/protein_classes.csv"),
		allergen,
	)
	if err != nil {
		t.Fatalf("NewSafetyGate: %v", err)
	}
	ground, err := grounding.NewService(
		dataPath("flavorgraph/embeddings.csv"),
		dataPath("aliases.csv"),
		dataPath("usda/nutrients.csv"),
		dataPath("foodon/allergens.csv"),
	)
	if err != nil {
		t.Fatalf("grounding.NewService: %v", err)
	}
	return orchestrator.Deps{
		Store:     st,
		Log:       eventlog.New(st),
		LLM:       llm.Stub{},
		Safety:    safety,
		Nutrition: nutrition,
		Cost:      cost,
		Grounding: ground,
	}
}

// --- instrument loading ---

// TestMoveScriptFixture pins the committed instrument: version 2 (PREREG §9
// retry amendment, 2026-07-09), N=5 moves, auto-accept policy with bounded
// move retries, and a comment stating it is pinned at T1.
func TestMoveScriptFixture(t *testing.T) {
	s, err := LoadScript(scriptPath)
	if err != nil {
		t.Fatalf("LoadScript: %v", err)
	}
	if s.Version != 2 {
		t.Errorf("version = %d, want 2 (retry-policy amendment)", s.Version)
	}
	if len(s.Moves) != 5 {
		t.Errorf("len(moves) = %d, want the pinned N=5", len(s.Moves))
	}
	if !strings.Contains(s.Comment, "T1") {
		t.Errorf("comment must state the script is pinned at T1, got %q", s.Comment)
	}
	want := ScriptPolicy{Verb: orchestrator.VerbAccept, OnBlocked: PolicyRetry, OnFailed: PolicyRetry, RetryLimit: 3}
	if s.Policy != want {
		t.Errorf("policy = %+v, want %+v", s.Policy, want)
	}
}

func TestLoadScriptValidation(t *testing.T) {
	valid := func() Script {
		return Script{
			Version: 1,
			Comment: "test script",
			Policy:  ScriptPolicy{Verb: orchestrator.VerbAccept, OnBlocked: OnBlockedAbort},
			Moves:   []ScriptMove{{MoveType: llm.MoveTypeSeedExpand}},
		}
	}
	if err := valid().Validate(); err != nil {
		t.Fatalf("valid script rejected: %v", err)
	}
	cases := []struct {
		name   string
		mutate func(*Script)
	}{
		{"zero version", func(s *Script) { s.Version = 0 }},
		{"no moves", func(s *Script) { s.Moves = nil }},
		{"unknown move type", func(s *Script) { s.Moves[0].MoveType = "julienne_everything" }},
		{"non-accept policy verb", func(s *Script) { s.Policy.Verb = "regenerate" }},
		{"unsupported on_blocked", func(s *Script) { s.Policy.OnBlocked = "skip" }},
		{"unsupported on_failed", func(s *Script) { s.Policy.OnFailed = "skip" }},
		{"retry without limit", func(s *Script) { s.Policy.OnBlocked = PolicyRetry }},
		{"limit without retry", func(s *Script) { s.Policy.RetryLimit = 3 }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := valid()
			tc.mutate(&s)
			if err := s.Validate(); err == nil {
				t.Errorf("Validate() = nil, want error")
			}
		})
	}
	if _, err := LoadScript(filepath.Join(t.TempDir(), "missing.json")); err == nil {
		t.Error("LoadScript(missing) = nil error, want error")
	}
	bad := filepath.Join(t.TempDir(), "bad.json")
	if err := os.WriteFile(bad, []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadScript(bad); err == nil {
		t.Error("LoadScript(malformed) = nil error, want error")
	}
}

func TestLoadSeeds(t *testing.T) {
	seeds, err := LoadSeeds(seedsPath)
	if err != nil {
		t.Fatalf("LoadSeeds: %v", err)
	}
	if len(seeds) != 2 {
		t.Fatalf("len(seeds) = %d, want 2", len(seeds))
	}
	for _, s := range seeds {
		if s.ID == "" || strings.TrimSpace(s.Seed) == "" {
			t.Errorf("seed missing id or seed text: %+v", s)
		}
		if s.Constraints.Cuisine != "western" {
			t.Errorf("seed %s cuisine = %q, want western (PREREG §6 scope)", s.ID, s.Constraints.Cuisine)
		}
	}
	if _, err := LoadSeeds(filepath.Join(t.TempDir(), "missing.json")); err == nil {
		t.Error("LoadSeeds(missing) = nil error, want error")
	}
	dup := filepath.Join(t.TempDir(), "dup.json")
	if err := os.WriteFile(dup, []byte(`[{"id":"a","seed":"x"},{"id":"a","seed":"y"}]`), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadSeeds(dup); err == nil {
		t.Error("LoadSeeds(duplicate ids) = nil error, want error")
	}
}

// --- the Amendment-1 dry-run oracle ---

// TestRunnerThreeArmDryRun drives the full harness: 3 arms × 2 synthetic
// seeds through the pinned move script on the stub LLM. It must emit
// structurally-complete claims, each carrying a machine-written label_tier1
// (this pinned script/stub combination never falls through to Tier 2 — every
// claim is either unsourced, hence correctly-unverified, or a pairing
// citation the arm's own re-derived evidence verifies, hence
// grounded-correct), and the 4.1 rates over those files render a results
// table with those Tier-1 labels folded in — with zero human labels anywhere.
func TestRunnerThreeArmDryRun(t *testing.T) {
	deps := realDeps(t)
	seeds, err := LoadSeeds(seedsPath)
	if err != nil {
		t.Fatalf("LoadSeeds: %v", err)
	}
	script, err := LoadScript(scriptPath)
	if err != nil {
		t.Fatalf("LoadScript: %v", err)
	}
	outDir := filepath.Join(t.TempDir(), "out")
	ctx := context.Background()

	byArm, _, err := Runner{Deps: deps, Script: script, Seeds: seeds, OutDir: outDir}.Run(ctx, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(byArm) != len(Arms) {
		t.Fatalf("Run returned %d arms, want %d", len(byArm), len(Arms))
	}

	// Per-dish stub claim arithmetic (hand-computed from llm.Stub templates):
	// seed_expand and flavor_direction each add one flavor_rationale claim;
	// every proposal carries the same one-line unverified[] entry, deduplicated
	// within the dish. 2 flavor claims + 1 unverified = 3 claims per seed,
	// 2 seeds => 6 claims per arm.
	const wantClaimsPerArm = 3 * 2

	allRates := map[string]ArmRates{}
	for _, arm := range Arms {
		path := filepath.Join(outDir, "claims_"+arm+".jsonl")
		f, err := os.Open(path)
		if err != nil {
			t.Fatalf("arm %s: claims file: %v", arm, err)
		}
		claims, err := ReadClaims(f)
		f.Close()
		if err != nil {
			t.Fatalf("arm %s: ReadClaims: %v", arm, err)
		}
		if !reflect.DeepEqual(claims, byArm[arm]) {
			t.Errorf("arm %s: returned claims differ from the written file", arm)
		}
		if len(claims) != wantClaimsPerArm {
			t.Errorf("arm %s: %d claims, want %d", arm, len(claims), wantClaimsPerArm)
		}
		seedIDs := map[string]bool{}
		for _, s := range seeds {
			seedIDs[s.ID] = true
		}
		seenIDs := map[string]bool{}
		hasPairingSource := false
		for _, c := range claims {
			if c.ClaimID == "" || c.Arm == "" || c.Dish == "" || c.Text == "" {
				t.Errorf("arm %s: structurally incomplete claim %+v", arm, c)
			}
			if seenIDs[c.ClaimID] {
				t.Errorf("arm %s: duplicate claim id %s", arm, c.ClaimID)
			}
			seenIDs[c.ClaimID] = true
			if c.Arm != arm {
				t.Errorf("claim %s arm = %q, want %q", c.ClaimID, c.Arm, arm)
			}
			if !seedIDs[c.Dish] {
				t.Errorf("claim %s dish = %q, not a seed id", c.ClaimID, c.Dish)
			}
			// (a) a claim with no source is mechanically correctly-unverified
			// (null provenance renders [unverified] — VerifyTier1 is exact here).
			if c.Source == "" && c.LabelTier1 != LabelCorrectlyUnverified {
				t.Errorf("claim %s: source empty, label_tier1 = %q, want %q", c.ClaimID, c.LabelTier1, LabelCorrectlyUnverified)
			}
			if strings.HasPrefix(c.Source, "pairing:") {
				hasPairingSource = true
				// (b) a pairing citation from the arm's own supplied evidence
				// verifies — the stub cites the first supplied pairing.
				if c.LabelTier1 != LabelGroundedCorrect {
					t.Errorf("claim %s: pairing-sourced claim label_tier1 = %q, want %q", c.ClaimID, c.LabelTier1, LabelGroundedCorrect)
				}
			}
			// The Amendment-1 stop-line: label_r1/label_r2 only ever come from
			// the author and the judge — never from this code. label_tier1 is
			// machine-written by the Tier-1 verifier.
			if c.LabelR1 != "" || c.LabelR2 != "" {
				t.Errorf("claim %s carries pre-filled labels (%q/%q) — label_r1/label_r2 only ever come from the author (R1) and the judge (R2)", c.ClaimID, c.LabelR1, c.LabelR2)
			}
		}
		switch arm {
		case llm.ArmFlavorgraph, llm.ArmGrounded:
			// (b) the grounded arms' own evidence yields at least one citation.
			if !hasPairingSource {
				t.Errorf("arm %s: no pairing:-sourced claim found, want >=1 (the stub cites the first supplied pairing)", arm)
			}
		case llm.ArmUngrounded:
			// (c) ungrounded evidence is always empty — never a pairing citation.
			if hasPairingSource {
				t.Errorf("arm %s: found a pairing:-sourced claim, want none (ungrounded evidence carries no pairings)", arm)
			}
		}
		rates, err := ComputeRates(claims)
		if err != nil {
			t.Fatalf("arm %s: ComputeRates: %v", arm, err)
		}
		r := rates[arm]
		// Every claim in this pinned dry run gets a determinate label_tier1
		// (correctly-unverified or grounded-correct — never mischaracterized
		// or hallucinated, since the stub never cites evidence it wasn't
		// given), so Tier-1 alone settles the full checkable denominator with
		// nothing unlabeled and a perfect (1.0) provenance rate.
		if r.Total != wantClaimsPerArm || r.Unlabeled != 0 || r.Checkable != wantClaimsPerArm || r.Excluded != 0 {
			t.Errorf("arm %s: N breakdown = total %d / unlabeled %d / checkable %d / excluded %d, want %d/0/%d/0",
				arm, r.Total, r.Unlabeled, r.Checkable, r.Excluded, wantClaimsPerArm, wantClaimsPerArm)
		}
		if r.Provenance != 1 || r.Mischaracterization != 0 || r.Hallucination != 0 {
			t.Errorf("arm %s: rates = %v/%v/%v, want 1/0/0 (Tier-1 settles every claim in this dry run)",
				arm, r.Provenance, r.Mischaracterization, r.Hallucination)
		}
		allRates[arm] = r
	}

	// The results table renders with Tier-1 having settled every claim and
	// the explicit Ns.
	table := RatesTable(allRates)
	for _, arm := range Arms {
		wantRow := "| " + arm + " | 6 | 0 | 6 | 0 | 1.000 | 0.000 | 0.000 |"
		if !strings.Contains(table, wantRow) {
			t.Errorf("results table missing row %q:\n%s", wantRow, table)
		}
	}

	// Every event is tagged run_kind=harness + its arm, and each dish replays
	// the exact scripted sequence.
	events, err := deps.Log.Replay(ctx, "")
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	// 3 arms × 2 seeds × (dish_created + 5×(move_requested, proposal_ready, gate_accept)).
	if want := 3 * 2 * (1 + 5*3); len(events) != want {
		t.Errorf("len(events) = %d, want %d", len(events), want)
	}
	armsSeen := map[string]bool{}
	for _, ev := range events {
		if ev.RunKind != RunKindHarness {
			t.Errorf("event %s run_kind = %q, want %q", ev.Type, ev.RunKind, RunKindHarness)
		}
		armsSeen[ev.Arm] = true
	}
	if len(armsSeen) != 3 || !armsSeen[llm.ArmUngrounded] || !armsSeen[llm.ArmFlavorgraph] || !armsSeen[llm.ArmGrounded] {
		t.Errorf("event arms seen = %v, want the three eval arms", armsSeen)
	}

	dishes, err := deps.Store.ListDishes(ctx)
	if err != nil {
		t.Fatalf("ListDishes: %v", err)
	}
	if len(dishes) != 6 {
		t.Fatalf("len(dishes) = %d, want 6 (3 arms × 2 seeds)", len(dishes))
	}
	wantTypes := []string{eventlog.TypeDishCreated}
	for i := 0; i < 5; i++ {
		wantTypes = append(wantTypes, eventlog.TypeMoveRequested, eventlog.TypeProposalReady, eventlog.TypeGateAccept)
	}
	for _, d := range dishes {
		evs, err := deps.Log.Replay(ctx, d.ID)
		if err != nil {
			t.Fatalf("Replay(%s): %v", d.ID, err)
		}
		types := make([]string, len(evs))
		for i, ev := range evs {
			types[i] = ev.Type
			if ev.Arm != evs[0].Arm {
				t.Errorf("dish %s: mixed arms %q/%q", d.ID, evs[0].Arm, ev.Arm)
			}
		}
		if !reflect.DeepEqual(types, wantTypes) {
			t.Errorf("dish %s event types = %v, want %v", d.ID, types, wantTypes)
		}
		vers, err := deps.Store.ListVersions(ctx, d.ID)
		if err != nil {
			t.Fatalf("ListVersions(%s): %v", d.ID, err)
		}
		if len(vers) != 5 {
			t.Errorf("dish %s has %d versions, want 5 (one per accepted move)", d.ID, len(vers))
		}
	}

	// H2 exclusion re-check (fully tested in replay_test.go): a log holding
	// only harness events folds to zero gate-dynamics observations.
	if g := FoldGateDynamics(events); g.Total.N != 0 || g.Sessions != 0 {
		t.Errorf("harness events leaked into the H2 fold: N=%d sessions=%d", g.Total.N, g.Sessions)
	}
}

// TestRunnerDeterministicAcrossRuns: the stub LLM is deterministic per move
// type/steer, so two full runs produce identical claims files and identical
// event streams modulo ids and timestamps.
func TestRunnerDeterministicAcrossRuns(t *testing.T) {
	seeds, err := LoadSeeds(seedsPath)
	if err != nil {
		t.Fatalf("LoadSeeds: %v", err)
	}
	script, err := LoadScript(scriptPath)
	if err != nil {
		t.Fatalf("LoadScript: %v", err)
	}
	runOnce := func() ([]eventlog.Event, string) {
		deps := realDeps(t)
		outDir := filepath.Join(t.TempDir(), "out")
		if _, _, err := (Runner{Deps: deps, Script: script, Seeds: seeds, OutDir: outDir}).Run(context.Background(), nil); err != nil {
			t.Fatalf("Run: %v", err)
		}
		events, err := deps.Log.Replay(context.Background(), "")
		if err != nil {
			t.Fatalf("Replay: %v", err)
		}
		return events, outDir
	}
	e1, d1 := runOnce()
	e2, d2 := runOnce()

	for _, arm := range Arms {
		b1, err := os.ReadFile(filepath.Join(d1, "claims_"+arm+".jsonl"))
		if err != nil {
			t.Fatalf("read run-1 claims for %s: %v", arm, err)
		}
		b2, err := os.ReadFile(filepath.Join(d2, "claims_"+arm+".jsonl"))
		if err != nil {
			t.Fatalf("read run-2 claims for %s: %v", arm, err)
		}
		if !bytes.Equal(b1, b2) {
			t.Errorf("arm %s: claims files differ across runs", arm)
		}
	}
	p1, p2 := projectEvents(t, e1), projectEvents(t, e2)
	if !reflect.DeepEqual(p1, p2) {
		t.Errorf("event streams differ across runs (modulo ids/timestamps):\nrun1: %v\nrun2: %v", p1, p2)
	}
}

// projectEvents strips the run-specific parts (ids, timestamps): what remains
// is type/arm/run_kind plus the payload's move_type and steer.
func projectEvents(t *testing.T, events []eventlog.Event) [][5]string {
	t.Helper()
	out := make([][5]string, 0, len(events))
	for _, e := range events {
		var p struct {
			MoveType string `json:"move_type"`
			Steer    string `json:"steer"`
		}
		if len(e.Payload) > 0 {
			if err := json.Unmarshal(e.Payload, &p); err != nil {
				t.Fatalf("unmarshal %s payload: %v", e.Type, err)
			}
		}
		out = append(out, [5]string{e.Type, e.Arm, e.RunKind, p.MoveType, p.Steer})
	}
	return out
}

// TestRunnerBlockedAbortsPerPolicy: the script policy is on_blocked=abort — a
// safety block ends the run with an error, no claims file is written, and the
// blocked event still lands in the log as real harness telemetry.
func TestRunnerBlockedAbortsPerPolicy(t *testing.T) {
	deps := realDeps(t)
	script := Script{
		Version: 1,
		Comment: "test-only script driving the seeded unsafe steer",
		Policy:  ScriptPolicy{Verb: orchestrator.VerbAccept, OnBlocked: OnBlockedAbort},
		Moves:   []ScriptMove{{MoveType: llm.MoveTypeIngredientChange, Steer: "infuse a garlic oil for drizzling"}},
	}
	seeds := []Seed{{
		ID:   "seed-synth-block",
		Seed: "SYNTHETIC: run that must block",
		Constraints: draft.Constraints{
			Dietary: []string{}, Allergens: []string{}, Equipment: []string{},
			Skill: "beginner", Servings: 2, OnHand: []string{}, Cuisine: "western",
		},
	}}
	outDir := filepath.Join(t.TempDir(), "out")

	_, _, err := Runner{Deps: deps, Script: script, Seeds: seeds, OutDir: outDir}.Run(context.Background(), []string{llm.ArmGrounded})
	if err == nil {
		t.Fatal("Run = nil error, want abort on the blocked move")
	}
	if !strings.Contains(err.Error(), "blocked") {
		t.Errorf("error %q does not name the block", err)
	}
	if _, statErr := os.Stat(filepath.Join(outDir, "claims_grounded.jsonl")); !os.IsNotExist(statErr) {
		t.Errorf("partial claims file written despite abort (stat err = %v)", statErr)
	}
	events, err := deps.Log.Replay(context.Background(), "")
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	var blocked *eventlog.Event
	for i := range events {
		if events[i].Type == eventlog.TypeProposalBlocked {
			blocked = &events[i]
		}
	}
	if blocked == nil {
		t.Fatal("no proposal_blocked event in the log")
	}
	if blocked.RunKind != RunKindHarness || blocked.Arm != llm.ArmGrounded {
		t.Errorf("blocked event stamped %q/%q, want %s/%s", blocked.Arm, blocked.RunKind, llm.ArmGrounded, RunKindHarness)
	}
}

// sabotageLLM wraps the deterministic stub, sabotaging the first N
// GenerateMove calls: mode "block" rewrites the steer to the seeded unsafe
// one (the REAL safety gate then blocks the proposal), mode "fail" returns a
// generation error (the orchestrator maps it to move_failed). Calls after
// the first N pass through untouched — retries recover exactly like a live
// model whose next roll behaves.
type sabotageLLM struct {
	mu       sync.Mutex
	mode     string // "block" | "fail"
	sabotage int    // number of leading calls to sabotage
	calls    int
	stub     llm.Stub
}

func (s *sabotageLLM) GenerateMove(ctx context.Context, req llm.MoveRequest) (proposal.Proposal, error) {
	s.mu.Lock()
	s.calls++
	n := s.calls
	s.mu.Unlock()
	if n <= s.sabotage {
		switch s.mode {
		case "fail":
			return proposal.Proposal{}, errors.New("synthetic generation failure")
		case "block":
			req.Steer = "infuse a garlic oil for drizzling"
		}
	}
	return s.stub.GenerateMove(ctx, req)
}

func retryScript(moves ...ScriptMove) Script {
	return Script{
		Version: 2,
		Comment: "test-only retry-policy script (T1 amendment shape)",
		Policy:  ScriptPolicy{Verb: orchestrator.VerbAccept, OnBlocked: PolicyRetry, OnFailed: PolicyRetry, RetryLimit: 2},
		Moves:   moves,
	}
}

func benignSeed(id string) Seed {
	return Seed{
		ID:   id,
		Seed: "SYNTHETIC: retry-policy seed " + id,
		Constraints: draft.Constraints{
			Dietary: []string{}, Allergens: []string{}, Equipment: []string{},
			Skill: "beginner", Servings: 2, OnHand: []string{}, Cuisine: "western",
		},
	}
}

// TestRunnerRetriesBlockedMoveThenSucceeds: policy on_blocked=retry issues
// gate verb=regenerate — the same recovery a cook uses — and the seed
// completes; the block stays in the eventlog as telemetry.
func TestRunnerRetriesBlockedMoveThenSucceeds(t *testing.T) {
	deps := realDeps(t)
	deps.LLM = &sabotageLLM{mode: "block", sabotage: 1}
	script := retryScript(ScriptMove{MoveType: llm.MoveTypeIngredientChange, Steer: "swap to something milder"})
	outDir := filepath.Join(t.TempDir(), "out")

	byArm, skipped, err := Runner{Deps: deps, Script: script, Seeds: []Seed{benignSeed("seed-retry-block")}, OutDir: outDir}.
		Run(context.Background(), []string{llm.ArmGrounded})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(skipped[llm.ArmGrounded]) != 0 {
		t.Fatalf("skipped = %+v, want none (retry recovered)", skipped[llm.ArmGrounded])
	}
	if len(byArm[llm.ArmGrounded]) == 0 {
		t.Fatal("no claims from the recovered seed")
	}
	events, err := deps.Log.Replay(context.Background(), "")
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	var sawBlock, sawRegenerate bool
	for _, e := range events {
		switch e.Type {
		case eventlog.TypeProposalBlocked:
			sawBlock = true
		case eventlog.TypeGateRegenerate:
			sawRegenerate = true
		}
	}
	if !sawBlock || !sawRegenerate {
		t.Errorf("eventlog block/regenerate = %v/%v, want both (block is telemetry, retry is a real gate verb)", sawBlock, sawRegenerate)
	}
}

// TestRunnerRetriesFailedMoveThenSucceeds: on_failed=retry re-proposes the
// move after a generation failure (dish returns to idle on move_failed).
func TestRunnerRetriesFailedMoveThenSucceeds(t *testing.T) {
	deps := realDeps(t)
	deps.LLM = &sabotageLLM{mode: "fail", sabotage: 1}
	script := retryScript(ScriptMove{MoveType: llm.MoveTypeIngredientChange, Steer: "swap to something milder"})
	outDir := filepath.Join(t.TempDir(), "out")

	byArm, skipped, err := Runner{Deps: deps, Script: script, Seeds: []Seed{benignSeed("seed-retry-fail")}, OutDir: outDir}.
		Run(context.Background(), []string{llm.ArmGrounded})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(skipped[llm.ArmGrounded]) != 0 || len(byArm[llm.ArmGrounded]) == 0 {
		t.Fatalf("skipped=%+v claims=%d, want recovery with no skip", skipped[llm.ArmGrounded], len(byArm[llm.ArmGrounded]))
	}
}

// TestRunnerSkipsSeedAfterRetryLimit: a move still blocked after retry_limit
// fresh generations drops its WHOLE seed (no partial-seed claims), the arm
// continues to later seeds, and the skip is reported — never silent.
func TestRunnerSkipsSeedAfterRetryLimit(t *testing.T) {
	deps := realDeps(t)
	// Seed 1's single move blocks on the first attempt + both retries
	// (3 sabotaged calls); seed 2's calls pass through clean.
	deps.LLM = &sabotageLLM{mode: "block", sabotage: 3}
	script := retryScript(ScriptMove{MoveType: llm.MoveTypeIngredientChange, Steer: "swap to something milder"})
	outDir := filepath.Join(t.TempDir(), "out")

	byArm, skipped, err := Runner{Deps: deps, Script: script,
		Seeds: []Seed{benignSeed("seed-doomed"), benignSeed("seed-clean")}, OutDir: outDir}.
		Run(context.Background(), []string{llm.ArmGrounded})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	skips := skipped[llm.ArmGrounded]
	if len(skips) != 1 || skips[0].SeedID != "seed-doomed" || skips[0].Move != 1 {
		t.Fatalf("skipped = %+v, want exactly seed-doomed at move 1", skips)
	}
	if !strings.Contains(skips[0].Reason, "blocked") {
		t.Errorf("skip reason %q does not name the block", skips[0].Reason)
	}
	claims := byArm[llm.ArmGrounded]
	if len(claims) == 0 {
		t.Fatal("no claims — the arm must continue past a skipped seed")
	}
	for _, c := range claims {
		if c.Dish == "seed-doomed" {
			t.Fatalf("claim %s from the skipped seed leaked into the export", c.ClaimID)
		}
	}
	// The claims file is still written — a run with reported skips is a
	// completed run; partial SEEDS are what never appear.
	if _, statErr := os.Stat(filepath.Join(outDir, "claims_grounded.jsonl")); statErr != nil {
		t.Errorf("claims file missing after completed run with skips: %v", statErr)
	}
}

// TestRunnerRejectsNonEvalArm: harness runs use the three PREREG §4 eval arms
// only — "none" is the operator stamp, never a harness arm.
func TestRunnerRejectsNonEvalArm(t *testing.T) {
	deps := realDeps(t)
	script, err := LoadScript(scriptPath)
	if err != nil {
		t.Fatalf("LoadScript: %v", err)
	}
	seeds, err := LoadSeeds(seedsPath)
	if err != nil {
		t.Fatalf("LoadSeeds: %v", err)
	}
	r := Runner{Deps: deps, Script: script, Seeds: seeds, OutDir: filepath.Join(t.TempDir(), "out")}
	if _, _, err := r.Run(context.Background(), []string{llm.ArmNone}); err == nil {
		t.Error(`Run(arms=["none"]) = nil error, want rejection`)
	}
}
