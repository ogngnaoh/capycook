package proposal

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/ogngnaoh/capycook/internal/draft"
)

func rm(s string) json.RawMessage { return json.RawMessage(s) }

// baseDraft returns a fully-populated Draft; every test that needs a
// pristine copy calls it again rather than sharing state.
func baseDraft() draft.Draft {
	fdc := "fdc-2258586"
	temp := 74.0
	prov := "flavorgraph:v1"
	return draft.Draft{
		Title:   "Smoky Roasted Carrots",
		Concept: "charred carrots, smoked paprika oil, herb yogurt",
		FlavorRationale: []draft.FlavorClaim{
			{Claim: "carrot and smoked paprika share caramel-sweet volatiles", Provenance: &prov, CuisineContext: "western"},
			{Claim: "yogurt acidity balances the char", CuisineContext: "western"}, // nil provenance => [unverified]
		},
		Ingredients: []draft.Ingredient{
			{Name: "carrot", FDCID: &fdc, Qty: 500, Unit: "g"},
			{Name: "smoked paprika", Qty: 2, Unit: "tsp"},
			{Name: "greek yogurt", Qty: 150, Unit: "g"},
		},
		Steps: []draft.Step{
			{Text: "Roast the carrots at 220C until charred at the edges.", Technique: "roast", Why: "char concentrates sweetness"},
			{Text: "Grill the chicken thighs.", Technique: "grill", InternalTempC: &temp, Why: "food safety"},
			{Text: "Blend the yogurt sauce.", Technique: "raw", Why: "cooling contrast"},
		},
		Constraints: draft.Constraints{
			Dietary:   []string{"halal"},
			Allergens: []string{"milk"},
			Equipment: []string{"oven"},
			Skill:     "intermediate",
			Servings:  2,
			OnHand:    []string{"carrot"},
			Cuisine:   "western",
		},
		Analysis: draft.Analysis{
			Cost: draft.CostAnalysis{TotalUSD: 6.4, PerServingUSD: 3.2, Approximate: true, Missing: []string{"smoked paprika"}},
			Nutrition: draft.NutritionAnalysis{
				Calories: 320, ProteinG: 21, FatG: 14, SatFatG: 3.5,
				CarbsG: 28, FiberG: 7, SugarG: 12, SodiumMg: 640,
				Unverified: []string{"sodium_mg"},
			},
		},
	}
}

// TestComputeDiffRoundTrip is the core property: for every pair of drafts,
// old.Apply(ComputeDiff(old, new)) deep-equals new.
func TestComputeDiffRoundTrip(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(d *draft.Draft)
	}{
		{"identical drafts", func(d *draft.Draft) {}},
		{"scalar title change", func(d *draft.Draft) { d.Title = "Charred Carrots, Two Ways" }},
		{"scalar concept change", func(d *draft.Draft) { d.Concept = "carrots three textures" }},
		{"ingredient qty edit", func(d *draft.Draft) { d.Ingredients[0].Qty = 250 }},
		{"ingredient nullable id set", func(d *draft.Draft) { id := "fdc-999"; d.Ingredients[1].FDCID = &id }},
		{"ingredient nullable id cleared", func(d *draft.Draft) { d.Ingredients[0].FDCID = nil }},
		{
			"ingredient insert at head",
			func(d *draft.Draft) {
				d.Ingredients = append([]draft.Ingredient{{Name: "olive oil", Qty: 30, Unit: "ml"}}, d.Ingredients...)
			},
		},
		{
			"ingredient append",
			func(d *draft.Draft) {
				d.Ingredients = append(d.Ingredients, draft.Ingredient{Name: "cumin seed", Qty: 1, Unit: "tsp"})
			},
		},
		{
			"ingredient delete middle",
			func(d *draft.Draft) {
				d.Ingredients = append(d.Ingredients[:1:1], d.Ingredients[2:]...)
			},
		},
		{
			"step edit technique and temp",
			func(d *draft.Draft) {
				temp := 65.0
				d.Steps[1].Technique = "sous_vide"
				d.Steps[1].InternalTempC = &temp
			},
		},
		{
			"step insert middle",
			func(d *draft.Draft) {
				s := draft.Step{Text: "Rest 5 minutes.", Technique: "other", Why: "carryover"}
				d.Steps = append(d.Steps[:1:1], append([]draft.Step{s}, d.Steps[1:]...)...)
			},
		},
		{
			"step delete first",
			func(d *draft.Draft) { d.Steps = d.Steps[1:] },
		},
		{
			"list insert delete and edit together",
			func(d *draft.Draft) {
				d.Ingredients[2].Qty = 200                                                               // edit survivor
				d.Ingredients = append(d.Ingredients[:1:1], d.Ingredients[2:]...)                        // delete middle
				d.Ingredients = append(d.Ingredients, draft.Ingredient{Name: "dill", Qty: 5, Unit: "g"}) // append
			},
		},
		{
			"steps reordered",
			func(d *draft.Draft) { d.Steps[0], d.Steps[2] = d.Steps[2], d.Steps[0] },
		},
		{
			"flavor claim provenance cleared to nil",
			func(d *draft.Draft) { d.FlavorRationale[0].Provenance = nil },
		},
		{
			"flavor claim added",
			func(d *draft.Draft) {
				d.FlavorRationale = append(d.FlavorRationale, draft.FlavorClaim{Claim: "dill lifts the yogurt", CuisineContext: "western"})
			},
		},
		{"servings change", func(d *draft.Draft) { d.Constraints.Servings = 4 }},
		{
			"allergen appended",
			func(d *draft.Draft) { d.Constraints.Allergens = append(d.Constraints.Allergens, "peanuts") },
		},
		{
			"dietary emptied",
			func(d *draft.Draft) { d.Constraints.Dietary = nil },
		},
		{
			"analysis cost change",
			func(d *draft.Draft) {
				d.Analysis.Cost.TotalUSD = 7.25
				d.Analysis.Cost.PerServingUSD = 3.63
				d.Analysis.Cost.Missing = nil
			},
		},
		{
			"analysis nutrition change",
			func(d *draft.Draft) {
				d.Analysis.Nutrition.Calories = 410
				d.Analysis.Nutrition.Unverified = []string{"sodium_mg", "fiber_g"}
			},
		},
		{
			"many fields at once",
			func(d *draft.Draft) {
				d.Title = "Carrots with Herb Yogurt"
				d.Steps = d.Steps[:2]
				d.Ingredients[0].Qty = 400
				d.Constraints.Servings = 3
				d.Analysis.Cost.TotalUSD = 5.1
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			old := baseDraft()
			new := baseDraft()
			tt.mutate(&new)

			ops := ComputeDiff(old, new)
			applied, err := old.Apply(ops)
			if err != nil {
				t.Fatalf("Apply(ComputeDiff): %v\nops: %s", err, opsJSON(t, ops))
			}
			if !reflect.DeepEqual(applied, new) {
				t.Fatalf("round-trip mismatch:\nops:  %s\ngot   %+v\nwant  %+v", opsJSON(t, ops), applied, new)
			}
			if !reflect.DeepEqual(old, baseDraft()) {
				t.Fatalf("ComputeDiff mutated its input: %+v", old)
			}
		})
	}
}

// TestComputeDiffRoundTripAcrossDrafts covers pairs that are not small
// mutations of one base: empty-to-populated, populated-to-empty, and two
// unrelated drafts.
func TestComputeDiffRoundTripAcrossDrafts(t *testing.T) {
	other := draft.Draft{
		Title:   "Miso Butter Corn",
		Concept: "charred corn, miso butter",
		Ingredients: []draft.Ingredient{
			{Name: "corn", Qty: 4, Unit: "ears"},
			{Name: "white miso", Qty: 30, Unit: "g"},
		},
		Steps: []draft.Step{
			{Text: "Char the corn.", Technique: "grill", Why: "smoke"},
		},
		Constraints: draft.Constraints{Skill: "beginner", Servings: 4, Cuisine: "western"},
	}
	tests := []struct {
		name     string
		old, new draft.Draft
	}{
		{"zero to populated", draft.Draft{}, baseDraft()},
		{"populated to zero", baseDraft(), draft.Draft{}},
		{"unrelated drafts", baseDraft(), other},
		{"both zero", draft.Draft{}, draft.Draft{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ops := ComputeDiff(tt.old, tt.new)
			applied, err := tt.old.Apply(ops)
			if err != nil {
				t.Fatalf("Apply(ComputeDiff): %v\nops: %s", err, opsJSON(t, ops))
			}
			if !reflect.DeepEqual(applied, tt.new) {
				t.Fatalf("round-trip mismatch:\nops:  %s\ngot   %+v\nwant  %+v", opsJSON(t, ops), applied, tt.new)
			}
		})
	}
}

// TestComputeDiffMinimalOps pins the shape of the emitted ops for canonical
// single edits: one targeted op, From filled on replace, no whole-document
// or whole-list rewrites.
func TestComputeDiffMinimalOps(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(d *draft.Draft)
		want   []Op
	}{
		{
			"identical drafts emit no ops",
			func(d *draft.Draft) {},
			nil,
		},
		{
			"scalar change is one replace with From",
			func(d *draft.Draft) { d.Title = "New Title" },
			[]Op{{Op: "replace", Path: "/title", Value: rm(`"New Title"`), From: rm(`"Smoky Roasted Carrots"`)}},
		},
		{
			"list element edit is one nested replace",
			func(d *draft.Draft) { d.Ingredients[0].Qty = 250 },
			[]Op{{Op: "replace", Path: "/ingredients/0/qty", Value: rm(`250`), From: rm(`500`)}},
		},
		{
			"list delete is one remove",
			func(d *draft.Draft) { d.Steps = append(d.Steps[:1:1], d.Steps[2:]...) },
			[]Op{{Op: "remove", Path: "/steps/1"}},
		},
		{
			"list insert is one add without From",
			func(d *draft.Draft) {
				d.Ingredients = append([]draft.Ingredient{{Name: "olive oil", Qty: 30, Unit: "ml"}}, d.Ingredients...)
			},
			[]Op{{Op: "add", Path: "/ingredients/0", Value: rm(`{"fdc_id":null,"foodon_id":null,"name":"olive oil","qty":30,"unit":"ml"}`)}},
		},
		{
			"nested analysis change is one replace",
			func(d *draft.Draft) { d.Analysis.Cost.TotalUSD = 7.25 },
			[]Op{{Op: "replace", Path: "/analysis/cost/total_usd", Value: rm(`7.25`), From: rm(`6.4`)}},
		},
		{
			"nullable set is one replace from null",
			func(d *draft.Draft) { id := "fdc-999"; d.Ingredients[1].FDCID = &id },
			[]Op{{Op: "replace", Path: "/ingredients/1/fdc_id", Value: rm(`"fdc-999"`), From: rm(`null`)}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			old := baseDraft()
			new := baseDraft()
			tt.mutate(&new)
			got := ComputeDiff(old, new)
			if !opsEqual(got, tt.want) {
				t.Fatalf("ComputeDiff = %s\nwant %s", opsJSON(t, got), opsJSON(t, tt.want))
			}
		})
	}
}

func TestComputeDiffDeterministic(t *testing.T) {
	old := baseDraft()
	new := baseDraft()
	new.Title = "New Title"
	new.Ingredients = append(new.Ingredients[:1:1], new.Ingredients[2:]...)
	new.Steps[0].Technique = "bake"
	new.Analysis.Nutrition.Calories = 410

	first := ComputeDiff(old, new)
	for i := 0; i < 10; i++ {
		if got := ComputeDiff(old, new); !opsEqual(got, first) {
			t.Fatalf("ComputeDiff not deterministic:\nfirst %s\ngot   %s", opsJSON(t, first), opsJSON(t, got))
		}
	}
}

func TestComputeDiffFeedsTargetFields(t *testing.T) {
	old := baseDraft()
	new := baseDraft()
	new.Steps[0].Technique = "bake"
	new.Title = "New Title"

	got := TargetFields(ComputeDiff(old, new))
	// Object members diff in sorted order, so steps comes before title.
	want := []string{"steps", "title"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("TargetFields = %v, want %v", got, want)
	}
}

// opsEqual compares op lists structurally, treating Value/From as JSON (so
// key order inside raw messages does not matter).
func opsEqual(a, b []Op) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Op != b[i].Op || a[i].Path != b[i].Path {
			return false
		}
		if !rawEqual(a[i].Value, b[i].Value) || !rawEqual(a[i].From, b[i].From) {
			return false
		}
	}
	return true
}

func rawEqual(a, b json.RawMessage) bool {
	if (a == nil) != (b == nil) {
		return false
	}
	if a == nil {
		return true
	}
	var av, bv any
	if err := json.Unmarshal(a, &av); err != nil {
		return false
	}
	if err := json.Unmarshal(b, &bv); err != nil {
		return false
	}
	return reflect.DeepEqual(av, bv)
}

func opsJSON(t *testing.T, ops []Op) string {
	t.Helper()
	raw, err := json.Marshal(ops)
	if err != nil {
		t.Fatalf("marshal ops: %v", err)
	}
	return string(raw)
}
