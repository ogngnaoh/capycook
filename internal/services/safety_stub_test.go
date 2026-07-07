package services

import (
	"context"
	"reflect"
	"testing"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/llm"
	"github.com/ogngnaoh/capycook/internal/proposal"
)

// baseDraft returns a garlic-free Draft; every test that needs a pristine
// copy calls it again rather than sharing state.
func baseDraft() draft.Draft {
	return draft.Draft{
		Title:   "Charred Carrots with Herb Yogurt",
		Concept: "sweet charred carrots against cold, sharp yogurt",
		Ingredients: []draft.Ingredient{
			{Name: "carrot", Qty: 500, Unit: "g"},
			{Name: "greek yogurt", Qty: 150, Unit: "ml"},
		},
		Steps: []draft.Step{
			{Text: "Roast the carrots at 220C until charred.", Technique: "roast", Why: "char concentrates sweetness"},
		},
		Constraints: draft.Constraints{Skill: "intermediate", Servings: 2, Cuisine: "western"},
	}
}

func TestStubSafetyGateScreen(t *testing.T) {
	tests := []struct {
		name        string
		mutate      func(d *draft.Draft) // nil => no ops
		wantBlocked bool
	}{
		{
			name: "seeded garlic-oil case blocks",
			mutate: func(d *draft.Draft) {
				d.Ingredients = append(d.Ingredients, draft.Ingredient{Name: "garlic", Qty: 4, Unit: "clove"})
				d.Steps = append(d.Steps, draft.Step{
					Text:      "Crush the garlic, submerge in olive oil, and leave at room temperature to infuse.",
					Technique: "infuse_oil",
					Why:       "flavored oil",
				})
			},
			wantBlocked: true,
		},
		{
			name: "infuse_oil step text mentions garlic without garlic ingredient blocks",
			mutate: func(d *draft.Draft) {
				d.Steps = append(d.Steps, draft.Step{
					Text:      "Steep sliced garlic in warm oil on the counter overnight.",
					Technique: "infuse_oil",
					Why:       "flavored oil",
				})
			},
			wantBlocked: true,
		},
		{
			name: "garlic ingredient with infuse_oil step not naming garlic blocks",
			mutate: func(d *draft.Draft) {
				d.Ingredients = append(d.Ingredients, draft.Ingredient{Name: "garlic", Qty: 4, Unit: "clove"})
				d.Steps = append(d.Steps, draft.Step{
					Text:      "Steep the aromatics in oil at room temperature.",
					Technique: "infuse_oil",
					Why:       "flavored oil",
				})
			},
			wantBlocked: true,
		},
		{
			name: "infuse_oil without garlic passes",
			mutate: func(d *draft.Draft) {
				d.Ingredients = append(d.Ingredients, draft.Ingredient{Name: "chili flakes", Qty: 2, Unit: "tsp"})
				d.Steps = append(d.Steps, draft.Step{
					Text:      "Warm the chili flakes in oil until fragrant.",
					Technique: "infuse_oil",
					Why:       "chili oil",
				})
			},
			wantBlocked: false,
		},
		{
			name: "garlic without infuse_oil passes",
			mutate: func(d *draft.Draft) {
				d.Ingredients = append(d.Ingredients, draft.Ingredient{Name: "garlic", Qty: 2, Unit: "clove"})
				d.Steps = append(d.Steps, draft.Step{
					Text:      "Saute the garlic until golden.",
					Technique: "saute",
					Why:       "aromatic base",
				})
			},
			wantBlocked: false,
		},
		{
			name:        "no ops passes",
			mutate:      nil,
			wantBlocked: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			current := baseDraft()
			var ops []proposal.Op
			if tt.mutate != nil {
				modified := baseDraft()
				tt.mutate(&modified)
				ops = proposal.ComputeDiff(current, modified)
			}
			got := StubSafetyGate{}.Screen(current, ops)
			if tt.wantBlocked {
				if got.Status != "blocked" {
					t.Fatalf("Status = %q, want blocked (%+v)", got.Status, got)
				}
				if len(got.Reasons) == 0 {
					t.Errorf("Reasons empty, want a human-readable reason")
				}
				if !reflect.DeepEqual(got.RuleIDs, []string{"anaerobic-garlic-oil"}) {
					t.Errorf("RuleIDs = %v, want [anaerobic-garlic-oil]", got.RuleIDs)
				}
				return
			}
			if got.Status != "pass" {
				t.Fatalf("Status = %q, want pass (%+v)", got.Status, got)
			}
			if len(got.Reasons) != 0 || len(got.RuleIDs) != 0 {
				t.Errorf("pass verdict carries reasons/rules: %+v", got)
			}
		})
	}
}

// TestStubSafetyGateInvalidOpsPass documents the stub's fail-open on
// unapplicable ops: it screens outcomes it can evaluate; a broken op list
// fails upstream at draft.Apply anyway.
func TestStubSafetyGateInvalidOpsPass(t *testing.T) {
	ops := []proposal.Op{{Op: "replace", Path: "/no_such_field", Value: []byte(`1`)}}
	got := StubSafetyGate{}.Screen(baseDraft(), ops)
	if got.Status != "pass" {
		t.Fatalf("Status = %q, want pass on unapplicable ops", got.Status)
	}
}

// TestStubSafetyGateScreensLLMStubOutput wires the two stubs together: the
// seeded garlic-oil proposal from llm.Stub must block; a clean one passes.
func TestStubSafetyGateScreensLLMStubOutput(t *testing.T) {
	current := baseDraft()

	seeded, err := llm.Stub{}.GenerateMove(context.Background(), llm.MoveRequest{
		Draft: current, MoveType: llm.MoveTypeIterateFeedback, Steer: "finish with garlic oil",
	})
	if err != nil {
		t.Fatalf("GenerateMove(seeded) error: %v", err)
	}
	if got := (StubSafetyGate{}).Screen(current, seeded.Change); got.Status != "blocked" {
		t.Errorf("seeded llm.Stub proposal: Status = %q, want blocked (%+v)", got.Status, got)
	}

	clean, err := llm.Stub{}.GenerateMove(context.Background(), llm.MoveRequest{
		Draft: current, MoveType: llm.MoveTypeIterateFeedback,
	})
	if err != nil {
		t.Fatalf("GenerateMove(clean) error: %v", err)
	}
	if got := (StubSafetyGate{}).Screen(current, clean.Change); got.Status != "pass" {
		t.Errorf("clean llm.Stub proposal: Status = %q, want pass (%+v)", got.Status, got)
	}
}
