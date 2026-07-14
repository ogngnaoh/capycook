package llm

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/grounding"
	"github.com/ogngnaoh/capycook/internal/proposal"
)

var allMoveTypes = []string{
	MoveTypeSeedExpand,
	MoveTypeFlavorDirection,
	MoveTypeIngredientChange,
	MoveTypeTechniqueStep,
	MoveTypeIterateFeedback,
	MoveTypeScaleServings,
	MoveTypeUnitConvert,
	MoveTypeCostRecompute,
	MoveTypeNutritionRecompute,
}

// baseDraft returns a fully-populated, garlic-free Draft; every test that
// needs a pristine copy calls it again rather than sharing state.
func baseDraft() draft.Draft {
	temp := 74.0
	return draft.Draft{
		Title:   "Charred Carrots with Herb Yogurt",
		Concept: "sweet charred carrots against cold, sharp yogurt",
		FlavorRationale: []draft.FlavorClaim{
			{Claim: "yogurt acidity balances the char", CuisineContext: "western"},
		},
		Ingredients: []draft.Ingredient{
			{Name: "carrot", Qty: 500, Unit: "g"},
			{Name: "chicken thigh", Qty: 400, Unit: "g"},
			{Name: "greek yogurt", Qty: 150, Unit: "ml"},
		},
		Steps: []draft.Step{
			{Text: "Roast the carrots at 220C until charred.", Technique: "roast", Why: "char concentrates sweetness"},
			{Text: "Grill the chicken thighs.", Technique: "grill", InternalTempC: &temp, Why: "food safety"},
		},
		Constraints: draft.Constraints{
			Skill:    "intermediate",
			Servings: 2,
			Cuisine:  "western",
		},
		Analysis: draft.Analysis{
			Cost: draft.CostAnalysis{TotalUSD: 6.4, PerServingUSD: 3.2, Approximate: true},
			Nutrition: draft.NutritionAnalysis{
				Calories: 320, ProteinG: 21, FatG: 14, SatFatG: 3.5,
				CarbsG: 28, FiberG: 7, SugarG: 12, SodiumMg: 640,
			},
		},
	}
}

// TestStubGenerateMovePerMoveType checks every move type yields a
// well-formed, applicable, draft-changing templated proposal.
func TestStubGenerateMovePerMoveType(t *testing.T) {
	valid := make(map[string]bool)
	for _, mt := range allMoveTypes {
		valid[mt] = true
	}
	for _, mt := range allMoveTypes {
		t.Run(mt, func(t *testing.T) {
			req := MoveRequest{Draft: baseDraft(), MoveType: mt}
			p, err := Stub{}.GenerateMove(context.Background(), req)
			if err != nil {
				t.Fatalf("GenerateMove(%s) error: %v", mt, err)
			}
			if p.MoveType != mt {
				t.Errorf("MoveType = %q, want %q", p.MoveType, mt)
			}
			if len(p.Change) == 0 {
				t.Fatalf("Change is empty, want a draft-modifying diff")
			}
			applied, err := req.Draft.Apply(p.Change)
			if err != nil {
				t.Fatalf("Apply(Change) error: %v", err)
			}
			if reflect.DeepEqual(applied, req.Draft) {
				t.Errorf("applying Change left the draft unchanged")
			}
			if !reflect.DeepEqual(req.Draft, baseDraft()) {
				t.Errorf("GenerateMove mutated the request draft")
			}
			if p.Rationale == "" {
				t.Errorf("Rationale is empty, want prose")
			}
			if p.Confidence != 0.6 {
				t.Errorf("Confidence = %v, want 0.6", p.Confidence)
			}
			if len(p.Unverified) != 1 {
				t.Errorf("Unverified = %v, want exactly one entry", p.Unverified)
			}
			if n := len(p.SuggestedNext); n < 2 || n > 3 {
				t.Errorf("SuggestedNext = %v, want 2-3 entries", p.SuggestedNext)
			}
			for _, next := range p.SuggestedNext {
				if !valid[next] {
					t.Errorf("SuggestedNext contains unknown move type %q", next)
				}
			}
			if want := proposal.TargetFields(p.Change); !reflect.DeepEqual(p.TargetFields, want) {
				t.Errorf("TargetFields = %v, want %v (derived from Change)", p.TargetFields, want)
			}
			if !reflect.DeepEqual(p.Safety, proposal.Safety{}) {
				t.Errorf("Safety = %+v, want zero (the gate fills it, not the model)", p.Safety)
			}
			if p.ID != "" || p.MoveID != "" {
				t.Errorf("ID/MoveID = %q/%q, want empty (the orchestrator assigns them)", p.ID, p.MoveID)
			}
		})
	}
}

func TestStubGenerateMoveDeterministic(t *testing.T) {
	req := MoveRequest{
		Draft:    baseDraft(),
		MoveType: MoveTypeFlavorDirection,
		Steer:    "smokier",
		Thread:   []ThreadTurn{{Role: "cook", Text: "make it smokier"}},
	}
	a, err := Stub{}.GenerateMove(context.Background(), req)
	if err != nil {
		t.Fatalf("first GenerateMove error: %v", err)
	}
	b, err := Stub{}.GenerateMove(context.Background(), req)
	if err != nil {
		t.Fatalf("second GenerateMove error: %v", err)
	}
	if !reflect.DeepEqual(a, b) {
		t.Errorf("GenerateMove not deterministic:\n first %+v\nsecond %+v", a, b)
	}
}

func TestStubGenerateMoveUnknownMoveType(t *testing.T) {
	_, err := Stub{}.GenerateMove(context.Background(), MoveRequest{Draft: baseDraft(), MoveType: "julienne_everything"})
	if err == nil {
		t.Fatalf("GenerateMove with unknown move type: want error, got nil")
	}
}

func TestStubGenerateMoveCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := Stub{}.GenerateMove(ctx, MoveRequest{Draft: baseDraft(), MoveType: MoveTypeSeedExpand})
	if err == nil {
		t.Fatalf("GenerateMove with cancelled context: want error, got nil")
	}
}

// TestStubLatencyHonored: a Stub with Latency set waits before answering —
// the demo-capture knob that keeps the proposing state on screen long
// enough to film. The zero value (every eval/test construction) never waits.
func TestStubLatencyHonored(t *testing.T) {
	start := time.Now()
	_, err := Stub{Latency: 60 * time.Millisecond}.GenerateMove(context.Background(),
		MoveRequest{Draft: baseDraft(), MoveType: MoveTypeSeedExpand})
	if err != nil {
		t.Fatalf("GenerateMove error: %v", err)
	}
	if elapsed := time.Since(start); elapsed < 60*time.Millisecond {
		t.Errorf("GenerateMove returned after %v, want at least the 60ms latency", elapsed)
	}
}

// TestStubLatencyCancelled: cancelling mid-wait returns the context error
// promptly — the workbench Stop button must genuinely stop the move.
func TestStubLatencyCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	start := time.Now()
	_, err := Stub{Latency: 30 * time.Second}.GenerateMove(ctx,
		MoveRequest{Draft: baseDraft(), MoveType: MoveTypeSeedExpand})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("GenerateMove error = %v, want context.Canceled", err)
	}
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Errorf("GenerateMove took %v after cancel, want a prompt return", elapsed)
	}
}

// TestStubOnDraftStreamsRationaleAcrossTheLatencyWindow: with OnDraft wired
// and a non-nil token sink, the rationale's words arrive live — spread out
// (not a single post-completion burst) and the FIRST word lands well before
// GenerateMove itself returns, matching BC-B-3's "during generation, not
// only after" contract.
func TestStubOnDraftStreamsRationaleAcrossTheLatencyWindow(t *testing.T) {
	var (
		mu        sync.Mutex
		tokens    []string
		firstAt   time.Duration
		draftSeen proposal.Proposal
	)
	start := time.Now()
	req := MoveRequest{Draft: baseDraft(), MoveType: MoveTypeSeedExpand}
	req.OnDraft = func(p proposal.Proposal) func(string) {
		draftSeen = p
		return func(text string) {
			mu.Lock()
			defer mu.Unlock()
			if len(tokens) == 0 {
				firstAt = time.Since(start)
			}
			tokens = append(tokens, text)
		}
	}
	got, err := Stub{Latency: 150 * time.Millisecond}.GenerateMove(context.Background(), req)
	if err != nil {
		t.Fatalf("GenerateMove error: %v", err)
	}
	elapsed := time.Since(start)
	if elapsed < 150*time.Millisecond {
		t.Errorf("GenerateMove returned after %v, want at least the 150ms latency", elapsed)
	}
	if draftSeen.Rationale != got.Rationale {
		t.Errorf("OnDraft preview rationale = %q, want the returned proposal's %q", draftSeen.Rationale, got.Rationale)
	}
	words := strings.Fields(got.Rationale)
	mu.Lock()
	replayed := strings.Join(tokens, "")
	gotFirstAt := firstAt
	mu.Unlock()
	if replayed != strings.Join(words, " ") {
		t.Errorf("streamed tokens joined = %q, want %q", replayed, strings.Join(words, " "))
	}
	// The first token must land comfortably before the call returns — proof
	// tokens flow DURING generation, not merely replayed at the end.
	if gotFirstAt >= elapsed/2 {
		t.Errorf("first token at %v, GenerateMove returned at %v — tokens did not start early", gotFirstAt, elapsed)
	}
}

// TestStubOnDraftNilSinkStaysSilent: OnDraft may decide NOT to stream (e.g.
// the caller judged the proposal unsafe to reveal) by returning a nil sink —
// the stub then waits out the same latency without calling anything, exactly
// as if OnDraft had never been set.
func TestStubOnDraftNilSinkStaysSilent(t *testing.T) {
	called := false
	req := MoveRequest{Draft: baseDraft(), MoveType: MoveTypeSeedExpand}
	req.OnDraft = func(proposal.Proposal) func(string) {
		called = true
		return nil
	}
	start := time.Now()
	_, err := Stub{Latency: 60 * time.Millisecond}.GenerateMove(context.Background(), req)
	if err != nil {
		t.Fatalf("GenerateMove error: %v", err)
	}
	if !called {
		t.Error("OnDraft was never called")
	}
	if elapsed := time.Since(start); elapsed < 60*time.Millisecond {
		t.Errorf("GenerateMove returned after %v, want at least the 60ms latency", elapsed)
	}
}

// TestStubOnDraftStreamCancelledMidWait: cancelling while tokens are
// streaming stops the sink being called further and returns promptly — the
// same Stop guarantee TestStubLatencyCancelled proves for the silent path.
func TestStubOnDraftStreamCancelledMidWait(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	var mu sync.Mutex
	var count int
	req := MoveRequest{Draft: baseDraft(), MoveType: MoveTypeSeedExpand}
	req.OnDraft = func(proposal.Proposal) func(string) {
		return func(string) {
			mu.Lock()
			count++
			n := count
			mu.Unlock()
			if n == 1 {
				cancel() // cancel right after the first token is revealed
			}
		}
	}
	start := time.Now()
	_, err := Stub{Latency: 30 * time.Second}.GenerateMove(ctx, req)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("GenerateMove error = %v, want context.Canceled", err)
	}
	if elapsed := time.Since(start); elapsed > 5*time.Second {
		t.Errorf("GenerateMove took %v after cancel, want a prompt return", elapsed)
	}
	mu.Lock()
	got := count
	mu.Unlock()
	// Not every word was revealed — the cancel genuinely cut the stream
	// short rather than draining it first.
	rationale := templates[MoveTypeSeedExpand].rationale
	if want := len(strings.Fields(rationale)); got >= want {
		t.Errorf("token sink called %d times, want fewer than the full %d words (cancel should cut it short)", got, want)
	}
}

// TestStubSeededGarlicOil checks the seeded unsafe case: a steer containing
// "garlic oil" makes the proposed draft gain a garlic ingredient plus a
// room-temperature infuse_oil step, so the safety stub can block it.
func TestStubSeededGarlicOil(t *testing.T) {
	tests := []struct {
		name       string
		steer      string
		wantSeeded bool
	}{
		{"steer with garlic oil", "finish with a garlic oil drizzle", true},
		{"steer case-insensitive", "add Garlic Oil please", true},
		{"steer without garlic oil", "make it smokier", false},
		{"empty steer", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := MoveRequest{Draft: baseDraft(), MoveType: MoveTypeIterateFeedback, Steer: tt.steer}
			p, err := Stub{}.GenerateMove(context.Background(), req)
			if err != nil {
				t.Fatalf("GenerateMove error: %v", err)
			}
			applied, err := req.Draft.Apply(p.Change)
			if err != nil {
				t.Fatalf("Apply(Change) error: %v", err)
			}
			var hasGarlic bool
			for _, ing := range applied.Ingredients {
				if strings.Contains(strings.ToLower(ing.Name), "garlic") {
					hasGarlic = true
				}
			}
			var infuseStep *draft.Step
			for i, s := range applied.Steps {
				if s.Technique == "infuse_oil" {
					infuseStep = &applied.Steps[i]
				}
			}
			if !tt.wantSeeded {
				if hasGarlic {
					t.Errorf("proposed draft gained a garlic ingredient without the seed steer")
				}
				if infuseStep != nil {
					t.Errorf("proposed draft gained an infuse_oil step without the seed steer")
				}
				return
			}
			if !hasGarlic {
				t.Errorf("proposed draft has no garlic ingredient, want the seeded unsafe case")
			}
			if infuseStep == nil {
				t.Fatalf("proposed draft has no infuse_oil step, want the seeded unsafe case")
			}
			if !strings.Contains(strings.ToLower(infuseStep.Text), "garlic") {
				t.Errorf("infuse_oil step text %q does not mention garlic", infuseStep.Text)
			}
		})
	}
}

// TestStubSteerFixtures checks the B2 seeded steer keywords each inject the
// op the behavior-contract oracle needs — a peanut allergen (BC-C-15), an
// under-temperature chicken step (BC-C-15), an unpriced ingredient (BC-D-10),
// and a low-confidence proposal (BC-C-25) — case-insensitively, and stay
// inert without the keyword.
func TestStubSteerFixtures(t *testing.T) {
	hasIngredient := func(d draft.Draft, name string) bool {
		for _, ing := range d.Ingredients {
			if strings.EqualFold(ing.Name, name) {
				return true
			}
		}
		return false
	}
	tests := []struct {
		name           string
		steer          string
		wantIngredient string // "" => no fixture ingredient expected
		wantConfidence float64
		wantChicken    bool
		wantDiffShapes bool // spring clean: add + in-place step replace + flavor remove
	}{
		{"peanut allergen", "add a peanut butter swirl", "peanut butter", 0.6, false, false},
		{"peanut case-insensitive", "PEANUT please", "peanut butter", 0.6, false, false},
		{"rare chicken min-temp", "give me rare chicken", "chicken breast", 0.6, true, false},
		{"saffron unpriced", "a pinch of Saffron", "saffron", 0.6, false, false},
		{"moonshot low confidence", "go moonshot on it", "", 0.15, false, false},
		{"spring clean add/change/remove", "give it a Spring Clean", "carrot", 0.6, false, true},
		{"no fixture steer", "make it smokier", "", 0.6, false, false},
		{"empty steer", "", "", 0.6, false, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := MoveRequest{Draft: baseDraft(), MoveType: MoveTypeIngredientChange, Steer: tt.steer}
			p, err := Stub{}.GenerateMove(context.Background(), req)
			if err != nil {
				t.Fatalf("GenerateMove error: %v", err)
			}
			if p.Confidence != tt.wantConfidence {
				t.Errorf("Confidence = %v, want %v", p.Confidence, tt.wantConfidence)
			}
			applied, err := req.Draft.Apply(p.Change)
			if err != nil {
				t.Fatalf("Apply(Change) error: %v", err)
			}
			if tt.wantIngredient != "" && !hasIngredient(applied, tt.wantIngredient) {
				t.Errorf("applied draft missing steered ingredient %q; ingredients=%+v", tt.wantIngredient, applied.Ingredients)
			}
			// Fixtures are mutually exclusive: no steer smuggles in another's
			// marker ingredient, and a plain steer adds none of them.
			if tt.wantIngredient != "peanut butter" && hasIngredient(applied, "peanut butter") {
				t.Errorf("unexpected peanut butter ingredient for steer %q", tt.steer)
			}
			if tt.wantIngredient != "saffron" && hasIngredient(applied, "saffron") {
				t.Errorf("unexpected saffron ingredient for steer %q", tt.steer)
			}
			if tt.wantChicken {
				var step *draft.Step
				for i := range applied.Steps {
					if applied.Steps[i].Technique == "fry" {
						step = &applied.Steps[i]
					}
				}
				if step == nil {
					t.Fatalf("rare chicken steer added no fried chicken step")
				}
				if step.InternalTempC == nil || *step.InternalTempC != 55 {
					t.Errorf("chicken step internal_temp_c = %v, want 55 (below the 74 C poultry minimum)", step.InternalTempC)
				}
			}
			if tt.wantDiffShapes {
				// BC-C-16 needs all three markup shapes from ONE proposal: an
				// added row, an in-place change, and a removed row. Assert the
				// op kinds the gate renders those from.
				var addIngredient, replaceStep, removeFlavor bool
				for _, op := range p.Change {
					switch {
					case op.Op == "add" && strings.HasPrefix(op.Path, "/ingredients/"):
						addIngredient = true
					case op.Op == "replace" && strings.HasPrefix(op.Path, "/steps/"):
						replaceStep = true
					case op.Op == "remove" && strings.HasPrefix(op.Path, "/flavor_rationale/"):
						removeFlavor = true
					}
				}
				if !addIngredient {
					t.Errorf("spring clean: no add op under /ingredients/; ops=%+v", p.Change)
				}
				if !replaceStep {
					t.Errorf("spring clean: no in-place replace op on a /steps/ path; ops=%+v", p.Change)
				}
				if !removeFlavor {
					t.Errorf("spring clean: no remove op on a /flavor_rationale/ path; ops=%+v", p.Change)
				}
			}
		})
	}
}

func TestStubSetsProvenanceFromEvidence(t *testing.T) {
	req := MoveRequest{
		Draft:    baseDraft(),
		MoveType: MoveTypeFlavorDirection,
		Evidence: Evidence{Pairings: []grounding.Pairing{{Ingredient: "basil", Score: 0.9}}},
	}
	p, err := Stub{}.GenerateMove(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	applied, err := req.Draft.Apply(p.Change)
	if err != nil {
		t.Fatalf("Apply(Change) error: %v", err)
	}
	var got *string
	for _, fc := range applied.FlavorRationale {
		if fc.Provenance != nil {
			got = fc.Provenance
		}
	}
	if got == nil || *got != "pairing:basil" {
		t.Fatalf("flavor claim provenance = %v, want pairing:basil", got)
	}
	// Pre-existing claims (baseDraft index 0) must NOT be stamped — only
	// claims this move appended may carry provenance.
	if pre := applied.FlavorRationale[0].Provenance; pre != nil {
		t.Fatalf("pre-existing flavor claim provenance = %q, want nil", *pre)
	}

	// No evidence (ungrounded arm) => provenance stays nil.
	req.Evidence = Evidence{}
	p, err = Stub{}.GenerateMove(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	applied, err = req.Draft.Apply(p.Change)
	if err != nil {
		t.Fatalf("Apply(Change) error: %v", err)
	}
	for _, fc := range applied.FlavorRationale {
		if fc.Provenance != nil {
			t.Fatalf("ungrounded stub claim carries provenance %q, want nil", *fc.Provenance)
		}
	}
}
