package services

import (
	"math"
	"os"
	"path/filepath"
	"testing"

	"github.com/ogngnaoh/capycook/internal/draft"
)

// Real vendored data (committed, pinned by data/usda/PROVENANCE.md):
//
//	butter    fdc 173410 per 100 g: kcal 717, protein 0.85, fat 81.11,
//	          sat 51.368, carbs 0.06, fiber 0, sugar 0.06, sodium 643;
//	          portion "1 tbsp" = 14.2 g
//	garlic    fdc 169230 per 100 g: kcal 149, protein 6.36, fat 0.5,
//	          sat 0.089, carbs 33.06, fiber 2.1, sugar 1, sodium 17;
//	          portion "1 clove" = 3 g
//	olive oil fdc 171413 per 100 g: kcal 884, protein 0, fat 100,
//	          sat 13.808, carbs 0, fiber 0, sugar 0, sodium 2
func realNutrition(t *testing.T) *USDANutrition {
	t.Helper()
	n, err := NewUSDANutrition(
		filepath.Join("..", "..", "data", "usda", "nutrients.csv"),
		filepath.Join("..", "..", "data", "usda", "portions.csv"),
	)
	if err != nil {
		t.Fatalf("NewUSDANutrition(real data): %v", err)
	}
	return n
}

func nutritionDraft(servings int, ings ...draft.Ingredient) draft.Draft {
	return draft.Draft{
		Ingredients: ings,
		Constraints: draft.Constraints{Servings: servings},
	}
}

func approxPanel(t *testing.T, got, want draft.NutritionAnalysis) {
	t.Helper()
	fields := []struct {
		name      string
		got, want float64
	}{
		{"calories", got.Calories, want.Calories},
		{"protein_g", got.ProteinG, want.ProteinG},
		{"fat_g", got.FatG, want.FatG},
		{"sat_fat_g", got.SatFatG, want.SatFatG},
		{"carbs_g", got.CarbsG, want.CarbsG},
		{"fiber_g", got.FiberG, want.FiberG},
		{"sugar_g", got.SugarG, want.SugarG},
		{"sodium_mg", got.SodiumMg, want.SodiumMg},
	}
	for _, f := range fields {
		if math.Abs(f.got-f.want) > 1e-6 {
			t.Errorf("%s = %v, want %v", f.name, f.got, f.want)
		}
	}
	if len(got.Unverified) != len(want.Unverified) {
		t.Fatalf("Unverified = %v, want %v", got.Unverified, want.Unverified)
	}
	for i := range want.Unverified {
		if got.Unverified[i] != want.Unverified[i] {
			t.Fatalf("Unverified = %v, want %v", got.Unverified, want.Unverified)
		}
	}
}

// oliveOil30MLFactor is the per-100g scale for 30 ml of olive oil converted
// through its "1 tbsp = 13.5 g" portion row (1 tbsp = 14.78676478125 ml).
const oliveOil30MLFactor = 30.0 / 14.78676478125 * 13.5 / 100

func TestUSDANutritionComputeRealData(t *testing.T) {
	n := realNutrition(t)
	tests := []struct {
		name string
		d    draft.Draft
		want draft.NutritionAnalysis
	}{
		{
			// 2 tbsp butter = 2 x 14.2 g = 28.4 g -> factor 0.284;
			// per dish: kcal 717x0.284=203.628, protein 0.2414,
			// fat 23.03524, sat 14.588512, carbs 0.01704, fiber 0,
			// sugar 0.01704, sodium 182.612; servings 2 halves it.
			name: "butter by tbsp portion, 2 servings",
			d:    nutritionDraft(2, draft.Ingredient{Name: "butter", Qty: 2, Unit: "tbsp"}),
			want: draft.NutritionAnalysis{
				Calories: 101.814, ProteinG: 0.1207, FatG: 11.51762,
				SatFatG: 7.294256, CarbsG: 0.00852, FiberG: 0,
				SugarG: 0.00852, SodiumMg: 91.306,
			},
		},
		{
			// 4 cloves garlic = 4 x 3 g = 12 g -> factor 0.12; 1 serving.
			// kcal 149x0.12=17.88, protein 0.7632, fat 0.06, sat 0.01068,
			// carbs 3.9672, fiber 0.252, sugar 0.12, sodium 2.04.
			name: "garlic by clove portion",
			d:    nutritionDraft(1, draft.Ingredient{Name: "garlic", Qty: 4, Unit: "clove"}),
			want: draft.NutritionAnalysis{
				Calories: 17.88, ProteinG: 0.7632, FatG: 0.06,
				SatFatG: 0.01068, CarbsG: 3.9672, FiberG: 0.252,
				SugarG: 0.12, SodiumMg: 2.04,
			},
		},
		{
			// grams are direct: 30 g olive oil -> factor 0.3, plus the
			// garlic above; 2 servings. olive oil per dish: kcal 265.2,
			// fat 30, sat 4.1424, sodium 0.6. Sums halved.
			name: "olive oil by grams plus garlic, 2 servings",
			d: nutritionDraft(2,
				draft.Ingredient{Name: "olive oil", Qty: 30, Unit: "g"},
				draft.Ingredient{Name: "garlic", Qty: 4, Unit: "clove"},
			),
			want: draft.NutritionAnalysis{
				Calories: (265.2 + 17.88) / 2, ProteinG: 0.7632 / 2,
				FatG: (30 + 0.06) / 2, SatFatG: (4.1424 + 0.01068) / 2,
				CarbsG: 3.9672 / 2, FiberG: 0.252 / 2,
				SugarG: 0.12 / 2, SodiumMg: (0.6 + 2.04) / 2,
			},
		},
		{
			// kg converts directly; plural + mixed-case units normalize
			// ("Cloves" -> clove, "TBSP" -> tbsp).
			name: "unit normalization",
			d: nutritionDraft(1,
				draft.Ingredient{Name: "olive oil", Qty: 0.03, Unit: "kg"},
				draft.Ingredient{Name: "garlic", Qty: 4, Unit: "Cloves"},
				draft.Ingredient{Name: "butter", Qty: 2, Unit: "TBSP"},
			),
			want: draft.NutritionAnalysis{
				Calories: 265.2 + 17.88 + 203.628, ProteinG: 0.7632 + 0.2414,
				FatG: 30 + 0.06 + 23.03524, SatFatG: 4.1424 + 0.01068 + 14.588512,
				CarbsG: 3.9672 + 0.01704, FiberG: 0.252,
				SugarG: 0.12 + 0.01704, SodiumMg: 0.6 + 2.04 + 182.612,
			},
		},
		{
			name: "empty draft is all zero, nothing unverified",
			d:    nutritionDraft(4),
			want: draft.NutritionAnalysis{},
		},
		{
			// servings <= 0 must not divide by zero; treated as 1.
			name: "zero servings treated as one",
			d:    nutritionDraft(0, draft.Ingredient{Name: "olive oil", Qty: 100, Unit: "g"}),
			want: draft.NutritionAnalysis{
				Calories: 884, FatG: 100, SatFatG: 13.808, SodiumMg: 2,
			},
		},
		{
			// metric volume converts to mass ONLY via the vendored portion
			// rows (units.go, task 2.3): 30 ml -> tbsp exactly
			// (14.78676478125 ml/tbsp), then "1 tbsp = 13.5 g" -> 27.39 g.
			name: "metric volume bridges through the tbsp portion row",
			d:    nutritionDraft(1, draft.Ingredient{Name: "olive oil", Qty: 30, Unit: "ml"}),
			want: draft.NutritionAnalysis{
				Calories: 884 * oliveOil30MLFactor,
				FatG:     100 * oliveOil30MLFactor,
				SatFatG:  13.808 * oliveOil30MLFactor,
				SodiumMg: 2 * oliveOil30MLFactor,
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := n.Compute(tt.d)
			if err != nil {
				t.Fatalf("Compute error: %v", err)
			}
			approxPanel(t, got, tt.want)
		})
	}
}

var allPanelFields = []string{
	"calories", "protein_g", "fat_g", "sat_fat_g",
	"carbs_g", "fiber_g", "sugar_g", "sodium_mg",
}

func TestUSDANutritionUnverifiedNeverGuessed(t *testing.T) {
	n := realNutrition(t)
	tests := []struct {
		name string
		d    draft.Draft
		want draft.NutritionAnalysis
	}{
		{
			// no USDA match for this name: contributes nothing, every
			// field carries an [unverified] marker.
			name: "unmatched ingredient",
			d:    nutritionDraft(1, draft.Ingredient{Name: "dragon fruit", Qty: 100, Unit: "g"}),
			want: draft.NutritionAnalysis{Unverified: allPanelFields},
		},
		{
			// butter has no "cup, melted-and-strained" style portion for
			// unit "splash": household unit without a portions row is
			// never guessed — zero contribution + markers.
			name: "missing portion conversion",
			d:    nutritionDraft(1, draft.Ingredient{Name: "butter", Qty: 1, Unit: "splash"}),
			want: draft.NutritionAnalysis{Unverified: allPanelFields},
		},
		{
			// red onion's only portion row is "1 whole": a volume quantity
			// has no portions-table path to mass, so it stays unverified —
			// a density is never assumed (volume->mass ONLY via portions).
			name: "volume unit with no volume portion rows",
			d:    nutritionDraft(1, draft.Ingredient{Name: "red onion", Qty: 100, Unit: "ml"}),
			want: draft.NutritionAnalysis{Unverified: allPanelFields},
		},
		{
			// a failing ingredient never poisons a verified one: garlic
			// still counts, markers still present, ordered canonically.
			name: "mixed verified and unverified",
			d: nutritionDraft(1,
				draft.Ingredient{Name: "garlic", Qty: 4, Unit: "clove"},
				draft.Ingredient{Name: "dragon fruit", Qty: 100, Unit: "g"},
			),
			want: draft.NutritionAnalysis{
				Calories: 17.88, ProteinG: 0.7632, FatG: 0.06,
				SatFatG: 0.01068, CarbsG: 3.9672, FiberG: 0.252,
				SugarG: 0.12, SodiumMg: 2.04,
				Unverified: allPanelFields,
			},
		},
		{
			// sage is a deliberately unmatched universe row (PROVENANCE.md)
			name: "sage has no USDA row",
			d:    nutritionDraft(1, draft.Ingredient{Name: "sage", Qty: 10, Unit: "g"}),
			want: draft.NutritionAnalysis{Unverified: allPanelFields},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := n.Compute(tt.d)
			if err != nil {
				t.Fatalf("Compute error: %v", err)
			}
			approxPanel(t, got, tt.want)
		})
	}
}

// synthetic fixture exercising fdc_id-keyed lookup and per-field blanks.
const testNutrientsCSV = `name,fdc_id,source_dataset,usda_description,calories_kcal,protein_g,fat_g,sat_fat_g,carbs_g,fiber_g,sugar_g,sodium_mg
widget fruit,900001,sr_legacy,"Widget fruit, raw",50,1,0.5,0.1,12,2,,10
plain paste,900002,sr_legacy,"Paste, plain",200,5,2,1,40,3,6,300
`

const testPortionsCSV = `name,fdc_id,source_dataset,amount,unit,portion_description,gram_weight
widget fruit,900001,sr_legacy,2,cup,"cup, chopped",300
plain paste,900002,sr_legacy,1,tbsp,tbsp,15
`

func syntheticNutrition(t *testing.T) *USDANutrition {
	t.Helper()
	dir := t.TempDir()
	np := filepath.Join(dir, "nutrients.csv")
	pp := filepath.Join(dir, "portions.csv")
	if err := os.WriteFile(np, []byte(testNutrientsCSV), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(pp, []byte(testPortionsCSV), 0o644); err != nil {
		t.Fatal(err)
	}
	n, err := NewUSDANutrition(np, pp)
	if err != nil {
		t.Fatalf("NewUSDANutrition(synthetic): %v", err)
	}
	return n
}

func strPtr(s string) *string { return &s }

func TestUSDANutritionSynthetic(t *testing.T) {
	n := syntheticNutrition(t)
	tests := []struct {
		name string
		d    draft.Draft
		want draft.NutritionAnalysis
	}{
		{
			// portion is "2 cups = 300 g" -> 150 g per cup; 1 cup ->
			// factor 1.5. Blank sugar_g on the row -> only sugar_g is
			// marked, everything else computes.
			name: "per-field blank stays unverified",
			d:    nutritionDraft(1, draft.Ingredient{Name: "widget fruit", Qty: 1, Unit: "cup"}),
			want: draft.NutritionAnalysis{
				Calories: 75, ProteinG: 1.5, FatG: 0.75, SatFatG: 0.15,
				CarbsG: 18, FiberG: 3, SugarG: 0, SodiumMg: 15,
				Unverified: []string{"sugar_g"},
			},
		},
		{
			// FDCID wins over the (unknown) name when set.
			name: "fdc_id-keyed lookup",
			d: nutritionDraft(1, draft.Ingredient{
				Name: "mystery jar", FDCID: strPtr("900002"), Qty: 30, Unit: "g",
			}),
			want: draft.NutritionAnalysis{
				Calories: 60, ProteinG: 1.5, FatG: 0.6, SatFatG: 0.3,
				CarbsG: 12, FiberG: 0.9, SugarG: 1.8, SodiumMg: 90,
			},
		},
		{
			// an FDCID missing from the vendored table is a non-match,
			// not a guess.
			name: "unknown fdc_id is unverified",
			d: nutritionDraft(1, draft.Ingredient{
				Name: "mystery jar", FDCID: strPtr("123456"), Qty: 30, Unit: "g",
			}),
			want: draft.NutritionAnalysis{Unverified: allPanelFields},
		},
		{
			// fdc_id-keyed lookup still reaches the portions table
			// (portions are joined by the row's canonical name).
			name: "fdc_id lookup with household unit",
			d: nutritionDraft(1, draft.Ingredient{
				Name: "unlabeled", FDCID: strPtr("900002"), Qty: 2, Unit: "tbsp",
			}),
			want: draft.NutritionAnalysis{
				Calories: 60, ProteinG: 1.5, FatG: 0.6, SatFatG: 0.3,
				CarbsG: 12, FiberG: 0.9, SugarG: 1.8, SodiumMg: 90,
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := n.Compute(tt.d)
			if err != nil {
				t.Fatalf("Compute error: %v", err)
			}
			approxPanel(t, got, tt.want)
		})
	}
}

func TestNewUSDANutritionErrors(t *testing.T) {
	if _, err := NewUSDANutrition("does-not-exist.csv", "also-missing.csv"); err == nil {
		t.Fatal("want error for missing files, got nil")
	}
	dir := t.TempDir()
	bad := filepath.Join(dir, "bad.csv")
	if err := os.WriteFile(bad, []byte("name,fdc_id\nonly,two\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := NewUSDANutrition(bad, bad); err == nil {
		t.Fatal("want error for malformed header, got nil")
	}
}
