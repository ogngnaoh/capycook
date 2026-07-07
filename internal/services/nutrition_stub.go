package services

import "github.com/ogngnaoh/capycook/internal/draft"

// StubNutrition returns one fixed placeholder panel for every draft; the
// USDA-backed computation lands in phase 2 behind the same interface.
type StubNutrition struct{}

var _ Nutrition = StubNutrition{}

// Compute ignores the draft and returns fixed placeholder numbers, with
// every field marked unverified so nothing mistakes them for real analysis.
func (StubNutrition) Compute(draft.Draft) (draft.NutritionAnalysis, error) {
	return draft.NutritionAnalysis{
		Calories: 420, ProteinG: 18, FatG: 16, SatFatG: 4,
		CarbsG: 52, FiberG: 8, SugarG: 11, SodiumMg: 580,
		Unverified: []string{
			"calories", "protein_g", "fat_g", "sat_fat_g",
			"carbs_g", "fiber_g", "sugar_g", "sodium_mg",
		},
	}, nil
}
