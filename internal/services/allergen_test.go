package services

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/ogngnaoh/capycook/internal/draft"
)

// realAllergens loads the committed FoodOn closure table (data/foodon/,
// provenance in its PROVENANCE.md). Real vendored rows exercised below:
//
//	butter        FOODON_03310351  -> milk
//	almond        FOODON_00003523  -> tree nuts
//	greek yogurt  FOODON_00004409  -> milk
//	onion         FOODON_03316347  -> (no Big-9 allergen)
func realAllergens(t *testing.T) *AllergenChecker {
	t.Helper()
	a, err := NewAllergenChecker(
		filepath.Join("..", "..", "data", "foodon", "allergens.csv"),
	)
	if err != nil {
		t.Fatalf("NewAllergenChecker(real data): %v", err)
	}
	return a
}

func allergenDraft(declared []string, ings ...draft.Ingredient) draft.Draft {
	return draft.Draft{
		Ingredients: ings,
		Constraints: draft.Constraints{Allergens: declared},
	}
}

func TestAllergenCheckRealData(t *testing.T) {
	a := realAllergens(t)
	tests := []struct {
		name        string
		d           draft.Draft
		wantBlocked bool
		wantReasons []string
		wantRuleIDs []string
	}{
		{
			// closure hit: butter resolves to milk.
			name:        "butter in a milk-free dish blocks",
			d:           allergenDraft([]string{"milk"}, draft.Ingredient{Name: "butter", Qty: 2, Unit: "tbsp"}),
			wantBlocked: true,
			wantReasons: []string{"butter contains declared allergen milk"},
			wantRuleIDs: []string{"allergen-milk"},
		},
		{
			// closure hit: almond resolves to tree nuts.
			name:        "almond in a tree-nut-free dish blocks",
			d:           allergenDraft([]string{"tree nuts"}, draft.Ingredient{Name: "almond", Qty: 50, Unit: "g"}),
			wantBlocked: true,
			wantReasons: []string{"almond contains declared allergen tree nuts"},
			wantRuleIDs: []string{"allergen-tree-nuts"},
		},
		{
			// fail-closed: an ingredient outside the universe table cannot be
			// resolved, and with allergens declared that is itself a block.
			name:        "unresolved ingredient with declared allergens blocks",
			d:           allergenDraft([]string{"milk"}, draft.Ingredient{Name: "almond milk", Qty: 200, Unit: "ml"}),
			wantBlocked: true,
			wantReasons: []string{"allergen status unknown for almond milk"},
			wantRuleIDs: []string{"allergen-unresolved"},
		},
		{
			// no declared allergens: nothing to enforce, even for an
			// unresolved ingredient.
			name: "no declared allergens passes",
			d: allergenDraft(nil,
				draft.Ingredient{Name: "butter", Qty: 2, Unit: "tbsp"},
				draft.Ingredient{Name: "almond milk", Qty: 200, Unit: "ml"},
			),
			wantBlocked: false,
		},
		{
			// resolved ingredient carrying no matching allergen passes.
			name:        "resolved non-allergen ingredient passes",
			d:           allergenDraft([]string{"milk"}, draft.Ingredient{Name: "onion", Qty: 1, Unit: "whole"}),
			wantBlocked: false,
		},
		{
			// declared allergen absent from every ingredient passes.
			name: "declared allergen not present passes",
			d: allergenDraft([]string{"peanuts"},
				draft.Ingredient{Name: "butter", Qty: 2, Unit: "tbsp"},
				draft.Ingredient{Name: "onion", Qty: 1, Unit: "whole"},
			),
			wantBlocked: false,
		},
		{
			// several violations aggregate in ingredient order; the unresolved
			// ingredient contributes a fail-closed block alongside the hits.
			name: "multiple violations aggregate",
			d: allergenDraft([]string{"milk", "tree nuts"},
				draft.Ingredient{Name: "butter", Qty: 2, Unit: "tbsp"},
				draft.Ingredient{Name: "almond", Qty: 50, Unit: "g"},
				draft.Ingredient{Name: "onion", Qty: 1, Unit: "whole"},
				draft.Ingredient{Name: "exotic root", Qty: 1, Unit: "whole"},
			),
			wantBlocked: true,
			wantReasons: []string{
				"butter contains declared allergen milk",
				"almond contains declared allergen tree nuts",
				"allergen status unknown for exotic root",
			},
			wantRuleIDs: []string{"allergen-milk", "allergen-tree-nuts", "allergen-unresolved"},
		},
		{
			// declared allergen values are matched case-insensitively.
			name:        "declared allergen is case-insensitive",
			d:           allergenDraft([]string{"Milk"}, draft.Ingredient{Name: "butter", Qty: 2, Unit: "tbsp"}),
			wantBlocked: true,
			wantReasons: []string{"butter contains declared allergen milk"},
			wantRuleIDs: []string{"allergen-milk"},
		},
		{
			// a FoodOn-resolved ingredient (grounded arm) is looked up by its
			// foodon_id even when its name is off-universe.
			name: "foodon_id resolves an off-name ingredient",
			d: allergenDraft([]string{"milk"},
				draft.Ingredient{Name: "cultured churned cream", FoodOnID: strPtr("FOODON_03310351"), Qty: 2, Unit: "tbsp"},
			),
			wantBlocked: true,
			wantReasons: []string{"cultured churned cream contains declared allergen milk"},
			wantRuleIDs: []string{"allergen-milk"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := a.Check(tt.d)
			if tt.wantBlocked {
				if got.Status != "blocked" {
					t.Fatalf("Status = %q, want blocked (%+v)", got.Status, got)
				}
				assertStrings(t, "Reasons", got.Reasons, tt.wantReasons)
				assertStrings(t, "RuleIDs", got.RuleIDs, tt.wantRuleIDs)
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

func assertStrings(t *testing.T, label string, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s = %v, want %v", label, got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("%s[%d] = %q, want %q", label, i, got[i], want[i])
		}
	}
}

func TestNewAllergenCheckerErrors(t *testing.T) {
	if _, err := NewAllergenChecker("does-not-exist.csv"); err == nil {
		t.Fatal("want error for missing file, got nil")
	}
	dir := t.TempDir()
	bad := filepath.Join(dir, "bad.csv")
	// header missing the required big9 column
	if err := os.WriteFile(bad, []byte("name,foodon_id\nonion,FOODON_1\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := NewAllergenChecker(bad); err == nil {
		t.Fatal("want error for malformed header, got nil")
	}
}

// synthetic table: exercises multi-allergen rows and name+foodon_id union.
const testAllergensCSV = `name,foodon_id,big9,mapping_method
soy sauce,FOODON_TEST_SS,wheat;soybeans,label_match+curated_allergen
plain leaf,FOODON_TEST_PL,,label_match
`

func TestAllergenCheckSynthetic(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "allergens.csv")
	if err := os.WriteFile(p, []byte(testAllergensCSV), 0o644); err != nil {
		t.Fatal(err)
	}
	a, err := NewAllergenChecker(p)
	if err != nil {
		t.Fatalf("NewAllergenChecker(synthetic): %v", err)
	}
	// a multi-allergen row reports every declared allergen it carries, in
	// canonical Big-9 order regardless of the declared order.
	got := a.Check(allergenDraft([]string{"soybeans", "wheat"},
		draft.Ingredient{Name: "soy sauce", Qty: 1, Unit: "tbsp"}))
	if got.Status != "blocked" {
		t.Fatalf("Status = %q, want blocked", got.Status)
	}
	assertStrings(t, "Reasons", got.Reasons, []string{
		"soy sauce contains declared allergen wheat",
		"soy sauce contains declared allergen soybeans",
	})
	// a resolved row with an empty big9 set passes.
	if got := a.Check(allergenDraft([]string{"wheat"},
		draft.Ingredient{Name: "plain leaf", Qty: 1, Unit: "whole"})); got.Status != "pass" {
		t.Fatalf("plain leaf: Status = %q, want pass (%+v)", got.Status, got)
	}
}
