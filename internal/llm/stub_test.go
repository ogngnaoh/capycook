package llm

import (
	"context"
	"reflect"
	"strings"
	"testing"

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
