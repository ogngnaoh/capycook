package services

import (
	"reflect"
	"testing"

	"github.com/ogngnaoh/capycook/internal/draft"
)

func TestStubNutritionCompute(t *testing.T) {
	tests := []struct {
		name string
		d    draft.Draft
	}{
		{"empty draft", draft.Draft{}},
		{"populated draft", baseDraft()},
	}
	want := draft.NutritionAnalysis{
		Calories: 420, ProteinG: 18, FatG: 16, SatFatG: 4,
		CarbsG: 52, FiberG: 8, SugarG: 11, SodiumMg: 580,
		Unverified: []string{
			"calories", "protein_g", "fat_g", "sat_fat_g",
			"carbs_g", "fiber_g", "sugar_g", "sodium_mg",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := StubNutrition{}.Compute(tt.d)
			if err != nil {
				t.Fatalf("Compute error: %v", err)
			}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("Compute = %+v, want the fixed placeholder panel %+v", got, want)
			}
		})
	}
}
