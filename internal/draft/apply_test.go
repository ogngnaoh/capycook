package draft

import (
	"encoding/json"
	"reflect"
	"testing"
)

func rm(s string) json.RawMessage { return json.RawMessage(s) }

func TestParsePointer(t *testing.T) {
	tests := []struct {
		pointer string
		want    []string
	}{
		{"", nil},
		{"/", []string{""}},
		{"/title", []string{"title"}},
		{"/ingredients/0/qty", []string{"ingredients", "0", "qty"}},
		{"/a~1b", []string{"a/b"}},
		{"/m~0n", []string{"m~n"}},
		{"/~01", []string{"~1"}}, // ~0 then 1, NOT an escaped /
	}
	for _, tt := range tests {
		got, err := parsePointer(tt.pointer)
		if err != nil {
			t.Errorf("parsePointer(%q): %v", tt.pointer, err)
			continue
		}
		if !reflect.DeepEqual(got, tt.want) {
			t.Errorf("parsePointer(%q) = %v, want %v", tt.pointer, got, tt.want)
		}
	}

	if _, err := parsePointer("title"); err == nil {
		t.Error("parsePointer without leading slash: want error, got nil")
	}
}

func TestApplyOps(t *testing.T) {
	tests := []struct {
		name  string
		ops   []Op
		check func(t *testing.T, got Draft)
	}{
		{
			name: "append ingredient",
			ops:  []Op{{Op: "add", Path: "/ingredients/-", Value: rm(`{"name":"cumin seed","fdc_id":null,"foodon_id":null,"qty":1,"unit":"tsp"}`)}},
			check: func(t *testing.T, got Draft) {
				if len(got.Ingredients) != 3 {
					t.Fatalf("len(Ingredients) = %d, want 3", len(got.Ingredients))
				}
				if got.Ingredients[2].Name != "cumin seed" || got.Ingredients[2].FDCID != nil {
					t.Fatalf("appended ingredient = %+v", got.Ingredients[2])
				}
			},
		},
		{
			name: "insert ingredient at index",
			ops:  []Op{{Op: "add", Path: "/ingredients/0", Value: rm(`{"name":"olive oil","fdc_id":null,"foodon_id":null,"qty":30,"unit":"ml"}`)}},
			check: func(t *testing.T, got Draft) {
				if len(got.Ingredients) != 3 || got.Ingredients[0].Name != "olive oil" || got.Ingredients[1].Name != "carrot" {
					t.Fatalf("Ingredients = %+v", got.Ingredients)
				}
			},
		},
		{
			name: "remove ingredient",
			ops:  []Op{{Op: "remove", Path: "/ingredients/0"}},
			check: func(t *testing.T, got Draft) {
				if len(got.Ingredients) != 1 || got.Ingredients[0].Name != "smoked paprika" {
					t.Fatalf("Ingredients = %+v", got.Ingredients)
				}
			},
		},
		{
			name: "replace ingredient qty",
			ops:  []Op{{Op: "replace", Path: "/ingredients/0/qty", Value: rm(`250`), From: rm(`500`)}},
			check: func(t *testing.T, got Draft) {
				if got.Ingredients[0].Qty != 250 {
					t.Fatalf("Qty = %v, want 250", got.Ingredients[0].Qty)
				}
			},
		},
		{
			name: "replace nullable fdc_id",
			ops:  []Op{{Op: "replace", Path: "/ingredients/1/fdc_id", Value: rm(`"fdc-999"`)}},
			check: func(t *testing.T, got Draft) {
				if got.Ingredients[1].FDCID == nil || *got.Ingredients[1].FDCID != "fdc-999" {
					t.Fatalf("FDCID = %v, want fdc-999", got.Ingredients[1].FDCID)
				}
			},
		},
		{
			name: "append step",
			ops:  []Op{{Op: "add", Path: "/steps/-", Value: rm(`{"text":"Rest 5 minutes.","technique":"other","internal_temp_c":null,"why":"carryover"}`)}},
			check: func(t *testing.T, got Draft) {
				if len(got.Steps) != 3 || got.Steps[2].Technique != "other" {
					t.Fatalf("Steps = %+v", got.Steps)
				}
			},
		},
		{
			name: "remove step",
			ops:  []Op{{Op: "remove", Path: "/steps/1"}},
			check: func(t *testing.T, got Draft) {
				if len(got.Steps) != 1 || got.Steps[0].Technique != "roast" {
					t.Fatalf("Steps = %+v", got.Steps)
				}
			},
		},
		{
			name: "replace whole step",
			ops:  []Op{{Op: "replace", Path: "/steps/1", Value: rm(`{"text":"Sous vide the thighs.","technique":"sous_vide","internal_temp_c":65,"why":"even doneness"}`)}},
			check: func(t *testing.T, got Draft) {
				s := got.Steps[1]
				if s.Technique != "sous_vide" || s.InternalTempC == nil || *s.InternalTempC != 65 {
					t.Fatalf("Steps[1] = %+v", s)
				}
			},
		},
		{
			name: "replace step technique",
			ops:  []Op{{Op: "replace", Path: "/steps/0/technique", Value: rm(`"bake"`), From: rm(`"roast"`)}},
			check: func(t *testing.T, got Draft) {
				if got.Steps[0].Technique != "bake" {
					t.Fatalf("Technique = %q, want bake", got.Steps[0].Technique)
				}
			},
		},
		{
			name: "set null internal temp to a value",
			ops:  []Op{{Op: "replace", Path: "/steps/0/internal_temp_c", Value: rm(`68`)}},
			check: func(t *testing.T, got Draft) {
				if got.Steps[0].InternalTempC == nil || *got.Steps[0].InternalTempC != 68 {
					t.Fatalf("InternalTempC = %v, want 68", got.Steps[0].InternalTempC)
				}
			},
		},
		{
			name: "clear internal temp back to null",
			ops:  []Op{{Op: "replace", Path: "/steps/1/internal_temp_c", Value: rm(`null`)}},
			check: func(t *testing.T, got Draft) {
				if got.Steps[1].InternalTempC != nil {
					t.Fatalf("InternalTempC = %v, want nil", *got.Steps[1].InternalTempC)
				}
			},
		},
		{
			name: "clear provenance to null marks claim unverified",
			ops:  []Op{{Op: "replace", Path: "/flavor_rationale/0/provenance", Value: rm(`null`)}},
			check: func(t *testing.T, got Draft) {
				if got.FlavorRationale[0].Provenance != nil {
					t.Fatalf("Provenance = %v, want nil", *got.FlavorRationale[0].Provenance)
				}
			},
		},
		{
			name: "replace scalar title",
			ops:  []Op{{Op: "replace", Path: "/title", Value: rm(`"Charred Carrots, Two Ways"`)}},
			check: func(t *testing.T, got Draft) {
				if got.Title != "Charred Carrots, Two Ways" {
					t.Fatalf("Title = %q", got.Title)
				}
			},
		},
		{
			name: "replace servings",
			ops:  []Op{{Op: "replace", Path: "/constraints/servings", Value: rm(`4`)}},
			check: func(t *testing.T, got Draft) {
				if got.Constraints.Servings != 4 {
					t.Fatalf("Servings = %d, want 4", got.Constraints.Servings)
				}
			},
		},
		{
			name: "append allergen",
			ops:  []Op{{Op: "add", Path: "/constraints/allergens/-", Value: rm(`"peanuts"`)}},
			check: func(t *testing.T, got Draft) {
				want := []string{"milk", "peanuts"}
				if !reflect.DeepEqual(got.Constraints.Allergens, want) {
					t.Fatalf("Allergens = %v, want %v", got.Constraints.Allergens, want)
				}
			},
		},
		{
			name: "replace nested analysis field",
			ops:  []Op{{Op: "replace", Path: "/analysis/cost/total_usd", Value: rm(`7.25`)}},
			check: func(t *testing.T, got Draft) {
				if got.Analysis.Cost.TotalUSD != 7.25 {
					t.Fatalf("TotalUSD = %v, want 7.25", got.Analysis.Cost.TotalUSD)
				}
			},
		},
		{
			name: "sequence of ops applies in order",
			ops: []Op{
				{Op: "remove", Path: "/steps/1"},
				{Op: "add", Path: "/steps/-", Value: rm(`{"text":"Blend the yogurt sauce.","technique":"raw","internal_temp_c":null,"why":"cooling contrast"}`)},
				{Op: "replace", Path: "/title", Value: rm(`"Carrots with Herb Yogurt"`)},
			},
			check: func(t *testing.T, got Draft) {
				if got.Title != "Carrots with Herb Yogurt" {
					t.Fatalf("Title = %q", got.Title)
				}
				if len(got.Steps) != 2 || got.Steps[1].Technique != "raw" {
					t.Fatalf("Steps = %+v", got.Steps)
				}
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			orig := baseDraft()
			got, err := orig.Apply(tt.ops)
			if err != nil {
				t.Fatalf("Apply: %v", err)
			}
			tt.check(t, got)
			if !reflect.DeepEqual(orig, baseDraft()) {
				t.Fatalf("receiver mutated by Apply:\ngot  %+v\nwant %+v", orig, baseDraft())
			}
		})
	}
}

func TestApplyNoOpsReturnsEqualDraft(t *testing.T) {
	orig := baseDraft()
	got, err := orig.Apply(nil)
	if err != nil {
		t.Fatalf("Apply(nil): %v", err)
	}
	if !reflect.DeepEqual(got, orig) {
		t.Fatalf("Apply(nil) mismatch:\ngot  %+v\nwant %+v", got, orig)
	}
}

func TestApplyReturnsDeepCopy(t *testing.T) {
	orig := baseDraft()
	got, err := orig.Apply([]Op{{Op: "replace", Path: "/ingredients/0/qty", Value: rm(`250`)}})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}

	// Mutating the result — including via shared-looking slices and
	// pointer fields — must never leak into the receiver.
	got.Title = "mutated"
	got.Ingredients[1].Name = "mutated"
	got.Constraints.Dietary[0] = "mutated"
	*got.Steps[1].InternalTempC = 0
	got.Analysis.Nutrition.Unverified[0] = "mutated"

	if !reflect.DeepEqual(orig, baseDraft()) {
		t.Fatalf("mutating Apply result leaked into receiver:\ngot  %+v\nwant %+v", orig, baseDraft())
	}
}

func TestApplyErrors(t *testing.T) {
	tests := []struct {
		name string
		ops  []Op
	}{
		{"unknown verb", []Op{{Op: "move", Path: "/title", Value: rm(`"x"`)}}},
		{"missing leading slash", []Op{{Op: "replace", Path: "title", Value: rm(`"x"`)}}},
		{"replace unknown member", []Op{{Op: "replace", Path: "/nope", Value: rm(`1`)}}},
		{"add unknown member rejected by schema", []Op{{Op: "add", Path: "/nope", Value: rm(`1`)}}},
		{"remove unknown member", []Op{{Op: "remove", Path: "/constraints/budget"}}},
		{"replace index out of range", []Op{{Op: "replace", Path: "/ingredients/9", Value: rm(`{}`)}}},
		{"remove index out of range", []Op{{Op: "remove", Path: "/steps/5"}}},
		{"add past end of array", []Op{{Op: "add", Path: "/steps/7", Value: rm(`{}`)}}},
		{"non-numeric index", []Op{{Op: "replace", Path: "/ingredients/first", Value: rm(`{}`)}}},
		{"leading-zero index", []Op{{Op: "replace", Path: "/ingredients/01", Value: rm(`{}`)}}},
		{"dash outside add", []Op{{Op: "remove", Path: "/ingredients/-"}}},
		{"descend through scalar", []Op{{Op: "replace", Path: "/title/0", Value: rm(`"x"`)}}},
		{"missing value", []Op{{Op: "add", Path: "/ingredients/-"}}},
		{"invalid value JSON", []Op{{Op: "replace", Path: "/title", Value: rm(`{bad`)}}},
		{"value violates schema", []Op{{Op: "replace", Path: "/title", Value: rm(`42`)}}},
		{"fractional servings violates schema", []Op{{Op: "replace", Path: "/constraints/servings", Value: rm(`2.5`)}}},
		{"remove root", []Op{{Op: "remove", Path: ""}}},
		{"failure after a successful op", []Op{
			{Op: "replace", Path: "/title", Value: rm(`"New"`)},
			{Op: "remove", Path: "/steps/9"},
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			orig := baseDraft()
			got, err := orig.Apply(tt.ops)
			if err == nil {
				t.Fatalf("Apply: want error, got nil (result %+v)", got)
			}
			if !reflect.DeepEqual(got, Draft{}) {
				t.Fatalf("Apply on error returned non-zero Draft: %+v", got)
			}
			if !reflect.DeepEqual(orig, baseDraft()) {
				t.Fatalf("receiver mutated by failed Apply:\ngot  %+v\nwant %+v", orig, baseDraft())
			}
		})
	}
}
