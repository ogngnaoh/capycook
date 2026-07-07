package draft

import (
	"encoding/json"
	"reflect"
	"testing"
)

// baseDraft returns a fully-populated Draft used across the tests. Every
// test that needs a pristine copy calls it again rather than sharing state.
func baseDraft() Draft {
	fdc := "fdc-2258586"
	temp := 74.0
	prov := "flavorgraph:v1"
	return Draft{
		Title:   "Smoky Roasted Carrots",
		Concept: "charred carrots, smoked paprika oil, herb yogurt",
		FlavorRationale: []FlavorClaim{
			{Claim: "carrot and smoked paprika share caramel-sweet volatiles", Provenance: &prov, CuisineContext: "western"},
			{Claim: "yogurt acidity balances the char", CuisineContext: "western"}, // nil provenance => [unverified]
		},
		Ingredients: []Ingredient{
			{Name: "carrot", FDCID: &fdc, Qty: 500, Unit: "g"},
			{Name: "smoked paprika", Qty: 2, Unit: "tsp"},
		},
		Steps: []Step{
			{Text: "Roast the carrots at 220C until charred at the edges.", Technique: "roast", Why: "char concentrates sweetness"},
			{Text: "Grill the chicken thighs.", Technique: "grill", InternalTempC: &temp, Why: "food safety"},
		},
		Constraints: Constraints{
			Dietary:   []string{"halal"},
			Allergens: []string{"milk"},
			Equipment: []string{"oven"},
			Skill:     "intermediate",
			Servings:  2,
			OnHand:    []string{"carrot"},
			Cuisine:   "western",
		},
		Analysis: Analysis{
			Cost: CostAnalysis{TotalUSD: 6.4, PerServingUSD: 3.2, Approximate: true, Missing: []string{"smoked paprika"}},
			Nutrition: NutritionAnalysis{
				Calories: 320, ProteinG: 21, FatG: 14, SatFatG: 3.5,
				CarbsG: 28, FiberG: 7, SugarG: 12, SodiumMg: 640,
				Unverified: []string{"sodium_mg"},
			},
		},
	}
}

func TestDraftJSONWireShape(t *testing.T) {
	raw, err := json.Marshal(baseDraft())
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("Unmarshal into map: %v", err)
	}
	for _, key := range []string{"title", "concept", "flavor_rationale", "ingredients", "steps", "constraints", "analysis"} {
		if _, ok := m[key]; !ok {
			t.Errorf("top-level key %q missing", key)
		}
	}

	// Nullable fields serialize as explicit nulls, not omitted members.
	ing := m["ingredients"].([]any)[1].(map[string]any)
	for _, key := range []string{"fdc_id", "foodon_id"} {
		if v, ok := ing[key]; !ok || v != nil {
			t.Errorf("unresolved ingredient %q = %v (present=%v), want explicit null", key, v, ok)
		}
	}
	step := m["steps"].([]any)[0].(map[string]any)
	if v, ok := step["internal_temp_c"]; !ok || v != nil {
		t.Errorf("step internal_temp_c = %v (present=%v), want explicit null", v, ok)
	}
	claim := m["flavor_rationale"].([]any)[1].(map[string]any)
	if v, ok := claim["provenance"]; !ok || v != nil {
		t.Errorf("claim provenance = %v (present=%v), want explicit null", v, ok)
	}

	// Spot-check nested analysis wire names.
	analysis := m["analysis"].(map[string]any)
	cost := analysis["cost"].(map[string]any)
	if cost["total_usd"] != 6.4 || cost["per_serving_usd"] != 3.2 || cost["approximate"] != true {
		t.Errorf("cost wire shape wrong: %v", cost)
	}
	nutrition := analysis["nutrition"].(map[string]any)
	for _, key := range []string{"calories", "protein_g", "fat_g", "sat_fat_g", "carbs_g", "fiber_g", "sugar_g", "sodium_mg", "unverified"} {
		if _, ok := nutrition[key]; !ok {
			t.Errorf("nutrition key %q missing", key)
		}
	}
}

func TestDraftJSONRoundTrip(t *testing.T) {
	orig := baseDraft()
	raw, err := json.Marshal(orig)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var got Draft
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if !reflect.DeepEqual(got, orig) {
		t.Fatalf("round-trip mismatch:\ngot  %+v\nwant %+v", got, orig)
	}
}
