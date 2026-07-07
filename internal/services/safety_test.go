package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/proposal"
)

func tempC(v float64) *float64 { return &v }

// realGate loads the committed FSIS/CDC-cited safety tables (data/safety/) and
// composes the real FoodOn allergen checker (data/foodon/), exactly as the
// orchestrator will wire it in task 2.8.
func realGate(t *testing.T) *DataSafetyGate {
	t.Helper()
	dataDir := filepath.Join("..", "..", "data")
	g, err := NewSafetyGate(
		filepath.Join(dataDir, "safety", "min_temps.csv"),
		filepath.Join(dataDir, "safety", "anaerobic_lexicon.csv"),
		filepath.Join(dataDir, "safety", "protein_classes.csv"),
		realAllergens(t),
	)
	if err != nil {
		t.Fatalf("NewSafetyGate(real data): %v", err)
	}
	return g
}

// safetyDraft builds a minimal draft from ingredients + steps for gate tests.
func safetyDraft(declared []string, ings []draft.Ingredient, steps []draft.Step) draft.Draft {
	return draft.Draft{
		Ingredients: ings,
		Steps:       steps,
		Constraints: draft.Constraints{Allergens: declared, Servings: 2, Cuisine: "western"},
	}
}

func ing(name string) draft.Ingredient { return draft.Ingredient{Name: name, Qty: 1, Unit: "whole"} }

func step(technique string, temp *float64, text string) draft.Step {
	return draft.Step{Technique: technique, InternalTempC: temp, Text: text, Why: "test"}
}

func TestSafetyGateScreenRealData(t *testing.T) {
	g := realGate(t)
	tests := []struct {
		name        string
		d           draft.Draft
		wantBlocked bool
		wantRuleID  string   // if set, blocked verdict must include it
		reasonHas   []string // substrings the aggregated reasons must contain
	}{
		// ---- cook-temperature rule, per protein class ----
		{
			name:        "poultry with no stated temp blocks",
			d:           safetyDraft(nil, []draft.Ingredient{ing("chicken breast")}, []draft.Step{step("roast", nil, "roast the chicken")}),
			wantBlocked: true, wantRuleID: "min-temp-poultry", reasonHas: []string{"74", "165"},
		},
		{
			name:        "poultry cooked to 74C passes",
			d:           safetyDraft(nil, []draft.Ingredient{ing("chicken breast")}, []draft.Step{step("roast", tempC(74), "roast the chicken to 74C")}),
			wantBlocked: false,
		},
		{
			name:        "poultry cooked to 73C (below minimum) blocks",
			d:           safetyDraft(nil, []draft.Ingredient{ing("chicken breast")}, []draft.Step{step("roast", tempC(73), "roast the chicken")}),
			wantBlocked: true, wantRuleID: "min-temp-poultry",
		},
		{
			name:        "ground meat with no temp blocks",
			d:           safetyDraft(nil, []draft.Ingredient{ing("ground beef")}, []draft.Step{step("saute", nil, "brown the beef")}),
			wantBlocked: true, wantRuleID: "min-temp-ground_meat", reasonHas: []string{"71", "160"},
		},
		{
			name:        "ground meat cooked to 71C passes",
			d:           safetyDraft(nil, []draft.Ingredient{ing("ground beef")}, []draft.Step{step("saute", tempC(71), "brown the beef")}),
			wantBlocked: false,
		},
		{
			name:        "whole cut with no temp blocks",
			d:           safetyDraft(nil, []draft.Ingredient{ing("beef steak")}, []draft.Step{step("grill", nil, "grill the steak")}),
			wantBlocked: true, wantRuleID: "min-temp-whole_cut", reasonHas: []string{"63", "145"},
		},
		{
			name:        "whole cut cooked to 63C passes",
			d:           safetyDraft(nil, []draft.Ingredient{ing("beef steak")}, []draft.Step{step("grill", tempC(63), "grill the steak")}),
			wantBlocked: false,
		},
		{
			name:        "fish with no temp blocks",
			d:           safetyDraft(nil, []draft.Ingredient{ing("salmon")}, []draft.Step{step("bake", nil, "bake the salmon")}),
			wantBlocked: true, wantRuleID: "min-temp-fish",
		},
		{
			name:        "fish cooked to 63C passes",
			d:           safetyDraft(nil, []draft.Ingredient{ing("salmon")}, []draft.Step{step("bake", tempC(63), "bake the salmon")}),
			wantBlocked: false,
		},
		{
			name:        "shellfish with no temp blocks",
			d:           safetyDraft(nil, []draft.Ingredient{ing("shrimp")}, []draft.Step{step("boil", nil, "boil the shrimp")}),
			wantBlocked: true, wantRuleID: "min-temp-shellfish",
		},
		{
			name:        "shellfish cooked to 63C passes",
			d:           safetyDraft(nil, []draft.Ingredient{ing("shrimp")}, []draft.Step{step("boil", tempC(63), "boil the shrimp")}),
			wantBlocked: false,
		},
		{
			name:        "egg dish with no temp blocks",
			d:           safetyDraft(nil, []draft.Ingredient{ing("egg")}, []draft.Step{step("bake", nil, "bake the frittata")}),
			wantBlocked: true, wantRuleID: "min-temp-eggs",
		},
		{
			name:        "egg dish cooked to 71C passes",
			d:           safetyDraft(nil, []draft.Ingredient{ing("egg")}, []draft.Step{step("bake", tempC(71), "bake the frittata")}),
			wantBlocked: false,
		},
		{
			name:        "raw preparation of a high-risk protein blocks",
			d:           safetyDraft(nil, []draft.Ingredient{ing("salmon")}, []draft.Step{step("raw", nil, "slice the salmon for crudo")}),
			wantBlocked: true, wantRuleID: "min-temp-fish",
		},
		{
			name:        "sous-vide of a high-risk protein blocks even with a stated temp (not a satisfying cook)",
			d:           safetyDraft(nil, []draft.Ingredient{ing("chicken breast")}, []draft.Step{step("sous_vide", tempC(74), "sous-vide the chicken at 74C")}),
			wantBlocked: true, wantRuleID: "min-temp-poultry",
		},
		{
			name:        "raw produce salad passes (no high-risk protein)",
			d:           safetyDraft(nil, []draft.Ingredient{ing("carrot"), ing("romaine lettuce")}, []draft.Step{step("raw", nil, "toss the salad")}),
			wantBlocked: false,
		},
		// ---- anaerobic lexicon, per rule ----
		{
			name: "room-temperature garlic-in-oil infusion blocks (botulism)",
			d: safetyDraft(nil,
				[]draft.Ingredient{ing("garlic"), draft.Ingredient{Name: "olive oil", Qty: 100, Unit: "ml"}},
				[]draft.Step{step("infuse_oil", nil, "submerge crushed garlic in olive oil at room temperature to infuse")}),
			wantBlocked: true, wantRuleID: "anaerobic-garlic-oil", reasonHas: []string{"botulinum"},
		},
		{
			name: "oil infusion with no low-acid aromatic passes",
			d: safetyDraft(nil,
				[]draft.Ingredient{{Name: "lemon zest", Qty: 5, Unit: "g"}, {Name: "olive oil", Qty: 100, Unit: "ml"}},
				[]draft.Step{step("infuse_oil", nil, "warm the oil with lemon zest")}),
			wantBlocked: false,
		},
		{
			name:        "home canning blocks",
			d:           safetyDraft(nil, []draft.Ingredient{ing("green bean")}, []draft.Step{step("can", nil, "can the green beans in a boiling-water bath")}),
			wantBlocked: true, wantRuleID: "anaerobic-home-canning",
		},
		{
			name:        "fermentation blocks",
			d:           safetyDraft(nil, []draft.Ingredient{ing("cabbage")}, []draft.Step{step("ferment", nil, "ferment the cabbage at room temperature")}),
			wantBlocked: true, wantRuleID: "anaerobic-fermentation",
		},
		{
			name:        "curing blocks",
			d:           safetyDraft(nil, []draft.Ingredient{ing("salmon")}, []draft.Step{step("cure", nil, "cure the fish with salt")}),
			wantBlocked: true, wantRuleID: "anaerobic-curing",
		},
		{
			name:        "sous-vide with no stated temp blocks (uncontrolled anaerobic hold)",
			d:           safetyDraft(nil, []draft.Ingredient{ing("carrot")}, []draft.Step{step("sous_vide", nil, "sous-vide the carrots")}),
			wantBlocked: true, wantRuleID: "anaerobic-sous-vide-no-temp-control",
		},
		{
			name:        "sous-vide of a non-protein with a stated temp passes",
			d:           safetyDraft(nil, []draft.Ingredient{ing("carrot")}, []draft.Step{step("sous_vide", tempC(85), "sous-vide the carrots at 85C")}),
			wantBlocked: false,
		},
		// ---- allergen half composed in ----
		{
			name: "almond milk in a nut-free dish blocks (allergen composed in)",
			d: safetyDraft([]string{"tree nuts"},
				[]draft.Ingredient{{Name: "almond milk", Qty: 200, Unit: "ml"}},
				[]draft.Step{step("boil", tempC(90), "warm the almond milk")}),
			wantBlocked: true, wantRuleID: "allergen-unresolved", reasonHas: []string{"almond milk"},
		},
		// ---- a fully safe dish ----
		{
			name: "safe cooked dish passes",
			d: safetyDraft(nil,
				[]draft.Ingredient{ing("chicken breast"), ing("carrot")},
				[]draft.Step{step("roast", tempC(75), "roast chicken and carrots to 75C")}),
			wantBlocked: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := g.Screen(tt.d, nil)
			if tt.wantBlocked {
				if got.Status != "blocked" {
					t.Fatalf("Status = %q, want blocked (%+v)", got.Status, got)
				}
				if len(got.Reasons) == 0 {
					t.Errorf("blocked verdict carries no reason: %+v", got)
				}
				if tt.wantRuleID != "" && !containsStr(got.RuleIDs, tt.wantRuleID) {
					t.Errorf("RuleIDs = %v, want to include %q", got.RuleIDs, tt.wantRuleID)
				}
				joined := strings.ToLower(strings.Join(got.Reasons, " | "))
				for _, sub := range tt.reasonHas {
					if !strings.Contains(joined, strings.ToLower(sub)) {
						t.Errorf("reasons %q missing expected substring %q", joined, sub)
					}
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

// TestSafetyGateFailsClosedOnUnapplicableOps documents the deliberate inversion
// of the stub's fail-open: an op list the gate cannot apply to the draft is
// blocked ("unable to evaluate proposal safety"), never passed.
func TestSafetyGateFailsClosedOnUnapplicableOps(t *testing.T) {
	g := realGate(t)
	ops := []proposal.Op{{Op: "replace", Path: "/no_such_field", Value: []byte(`1`)}}
	got := g.Screen(baseDraft(), ops)
	if got.Status != "blocked" {
		t.Fatalf("Status = %q, want blocked on unapplicable ops", got.Status)
	}
	if !containsStr(got.Reasons, "unable to evaluate proposal safety") {
		t.Errorf("Reasons = %v, want the fail-closed message", got.Reasons)
	}
}

// TestSafetyGateAppliesOps confirms Screen judges the post-apply draft: a clean
// current draft plus ops that introduce a high-risk protein with no
// sufficiently-hot cooking step blocks.
func TestSafetyGateAppliesOps(t *testing.T) {
	g := realGate(t)
	current := safetyDraft(nil, []draft.Ingredient{ing("carrot")}, []draft.Step{step("raw", nil, "peel and shave the carrots")})
	modified := current
	modified.Ingredients = append([]draft.Ingredient{}, current.Ingredients...)
	modified.Ingredients = append(modified.Ingredients, ing("chicken breast"))
	modified.Steps = append([]draft.Step{}, current.Steps...)
	modified.Steps = append(modified.Steps, step("saute", nil, "add and cook the chicken"))
	ops := proposal.ComputeDiff(current, modified)

	got := g.Screen(current, ops)
	if got.Status != "blocked" {
		t.Fatalf("Status = %q, want blocked after applying unsafe ops (%+v)", got.Status, got)
	}
	if !containsStr(got.RuleIDs, "min-temp-poultry") {
		t.Errorf("RuleIDs = %v, want min-temp-poultry", got.RuleIDs)
	}
}

func TestNewSafetyGateErrors(t *testing.T) {
	a := realAllergens(t)
	dataDir := filepath.Join("..", "..", "data", "safety")
	if _, err := NewSafetyGate("missing.csv", filepath.Join(dataDir, "anaerobic_lexicon.csv"), filepath.Join(dataDir, "protein_classes.csv"), a); err == nil {
		t.Error("want error for missing min_temps file")
	}
	dir := t.TempDir()
	bad := filepath.Join(dir, "min_temps.csv")
	if err := os.WriteFile(bad, []byte("protein_class,min_internal_temp_c,rest_time_min\npoultry,notanumber,0\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := NewSafetyGate(bad, filepath.Join(dataDir, "anaerobic_lexicon.csv"), filepath.Join(dataDir, "protein_classes.csv"), a); err == nil {
		t.Error("want error for non-numeric min_internal_temp_c")
	}
}

func containsStr(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}
