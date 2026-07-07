package services

import (
	"math"
	"os"
	"path/filepath"
	"testing"

	"github.com/ogngnaoh/capycook/internal/draft"
)

// Real committed data (data/cost/prices.csv, provenance in
// data/cost/PROVENANCE.md; portions pinned by data/usda/PROVENANCE.md):
//
//	chicken breast  $0.9195 per 100 g (BLS APU0000FF1101, 2026-05)
//	butter          $0.8662 per 100 g (BLS APU0000FS1101, 2026-05);
//	                portion "1 tbsp" = 14.2 g
//	garlic          $0.88 per 100 g (tier-B estimate, 2026-07);
//	                portion "1 clove" = 3 g
//	egg             $0.1826 per unit (BLS APU0000708111, $2.191/doz, 2026-05);
//	                portion "1 whole" = 50.3 g
func realCost(t *testing.T) *TableCost {
	t.Helper()
	c, err := NewTableCost(
		filepath.Join("..", "..", "data", "cost", "prices.csv"),
		filepath.Join("..", "..", "data", "usda", "portions.csv"),
	)
	if err != nil {
		t.Fatalf("NewTableCost(real data): %v", err)
	}
	return c
}

func approxCost(t *testing.T, got, want draft.CostAnalysis) {
	t.Helper()
	if math.Abs(got.TotalUSD-want.TotalUSD) > 1e-9 {
		t.Errorf("TotalUSD = %v, want %v", got.TotalUSD, want.TotalUSD)
	}
	if math.Abs(got.PerServingUSD-want.PerServingUSD) > 1e-9 {
		t.Errorf("PerServingUSD = %v, want %v", got.PerServingUSD, want.PerServingUSD)
	}
	if !got.Approximate {
		t.Error("Approximate = false, want true (always)")
	}
	if len(got.Missing) != len(want.Missing) {
		t.Fatalf("Missing = %v, want %v", got.Missing, want.Missing)
	}
	for i := range want.Missing {
		if got.Missing[i] != want.Missing[i] {
			t.Fatalf("Missing = %v, want %v", got.Missing, want.Missing)
		}
	}
}

func TestTableCostComputeRealData(t *testing.T) {
	c := realCost(t)

	// Hand-checked dish total (prices and portions quoted above):
	//   chicken breast 200 g          -> 2.00   x 0.9195 = 1.839
	//   butter 2 tbsp  = 28.4 g       -> 0.284  x 0.8662 = 0.2460008
	//   garlic 4 clove = 12 g         -> 0.12   x 0.88   = 0.1056
	//   total 2.1906008; 2 servings -> 1.0953004 per serving
	const handChecked = 2.00*0.9195 + 0.284*0.8662 + 0.12*0.88

	tests := []struct {
		name string
		d    draft.Draft
		want draft.CostAnalysis
	}{
		{
			name: "hand-checked dish total, 2 servings",
			d: nutritionDraft(2,
				draft.Ingredient{Name: "chicken breast", Qty: 200, Unit: "g"},
				draft.Ingredient{Name: "butter", Qty: 2, Unit: "tbsp"},
				draft.Ingredient{Name: "garlic", Qty: 4, Unit: "clove"},
			),
			want: draft.CostAnalysis{
				TotalUSD:      handChecked,
				PerServingUSD: handChecked / 2,
				Approximate:   true,
				Missing:       []string{},
			},
		},
		{
			// per_unit basis: count comes straight from the whole-egg rows.
			name: "eggs priced per unit",
			d:    nutritionDraft(1, draft.Ingredient{Name: "egg", Qty: 2, Unit: "whole"}),
			want: draft.CostAnalysis{
				TotalUSD:      2 * 0.1826,
				PerServingUSD: 2 * 0.1826,
				Approximate:   true,
				Missing:       []string{},
			},
		},
		{
			// per_unit basis with a mass quantity: grams resolve through the
			// shared portion machinery, then divide by "1 whole" = 50.3 g.
			name: "egg by grams converts through the whole portion",
			d:    nutritionDraft(1, draft.Ingredient{Name: "egg", Qty: 100, Unit: "g"}),
			want: draft.CostAnalysis{
				TotalUSD:      100.0 / 50.3 * 0.1826,
				PerServingUSD: 100.0 / 50.3 * 0.1826,
				Approximate:   true,
				Missing:       []string{},
			},
		},
		{
			// names and units normalize like nutrition's lookup.
			name: "name and unit normalization",
			d: nutritionDraft(1,
				draft.Ingredient{Name: "Chicken Breasts", Qty: 100, Unit: "g"},
				draft.Ingredient{Name: "butter", Qty: 2, Unit: "TBSP"},
			),
			want: draft.CostAnalysis{
				TotalUSD:      0.9195 + 0.284*0.8662,
				PerServingUSD: 0.9195 + 0.284*0.8662,
				Approximate:   true,
				Missing:       []string{},
			},
		},
		{
			name: "empty draft costs nothing, still approximate",
			d:    nutritionDraft(4),
			want: draft.CostAnalysis{Approximate: true, Missing: []string{}},
		},
		{
			// servings <= 0 must not divide by zero; treated as 1.
			name: "zero servings treated as one",
			d:    nutritionDraft(0, draft.Ingredient{Name: "garlic", Qty: 4, Unit: "clove"}),
			want: draft.CostAnalysis{
				TotalUSD:      0.1056,
				PerServingUSD: 0.1056,
				Approximate:   true,
				Missing:       []string{},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := c.Compute(tt.d)
			if err != nil {
				t.Fatalf("Compute error: %v", err)
			}
			approxCost(t, got, tt.want)
		})
	}
}

func TestTableCostMissingFootnoteNeverZeroDollar(t *testing.T) {
	c := realCost(t)
	tests := []struct {
		name string
		d    draft.Draft
		want draft.CostAnalysis
	}{
		{
			// no price row: excluded from the total AND listed — the total
			// must reflect only priced ingredients, never a silent $0 line.
			name: "unpriced ingredient is excluded and footnoted",
			d: nutritionDraft(1,
				draft.Ingredient{Name: "garlic", Qty: 4, Unit: "clove"},
				draft.Ingredient{Name: "dragon fruit", Qty: 100, Unit: "g"},
			),
			want: draft.CostAnalysis{
				TotalUSD:      0.1056,
				PerServingUSD: 0.1056,
				Approximate:   true,
				Missing:       []string{"dragon fruit"},
			},
		},
		{
			// a priced ingredient whose quantity cannot be converted to the
			// price basis is just as unpriceable — footnote, not a guess.
			name: "no conversion path is footnoted",
			d:    nutritionDraft(1, draft.Ingredient{Name: "butter", Qty: 1, Unit: "splash"}),
			want: draft.CostAnalysis{Approximate: true, Missing: []string{"butter"}},
		},
		{
			// red onion's only portion row is "1 whole": volume->mass has no
			// portions path, so the line is unpriceable (density never assumed).
			name: "volume with no volume portion row is footnoted",
			d:    nutritionDraft(1, draft.Ingredient{Name: "red onion", Qty: 100, Unit: "ml"}),
			want: draft.CostAnalysis{Approximate: true, Missing: []string{"red onion"}},
		},
		{
			name: "all ingredients missing yields zero total plus footnotes",
			d: nutritionDraft(2,
				draft.Ingredient{Name: "dragon fruit", Qty: 100, Unit: "g"},
				draft.Ingredient{Name: "star fruit", Qty: 1, Unit: "whole"},
			),
			want: draft.CostAnalysis{
				Approximate: true,
				Missing:     []string{"dragon fruit", "star fruit"},
			},
		},
		{
			name: "repeated missing ingredient is footnoted once",
			d: nutritionDraft(1,
				draft.Ingredient{Name: "dragon fruit", Qty: 100, Unit: "g"},
				draft.Ingredient{Name: "dragon fruit", Qty: 50, Unit: "g"},
			),
			want: draft.CostAnalysis{
				Approximate: true,
				Missing:     []string{"dragon fruit"},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := c.Compute(tt.d)
			if err != nil {
				t.Fatalf("Compute error: %v", err)
			}
			approxCost(t, got, tt.want)
		})
	}
}

// TestPricesCoverUniverse pins the data contract: every ingredient in the
// canonical universe has exactly one price row, and no price row strays
// outside the universe (spec §5 — the universe bounds the cost table).
func TestPricesCoverUniverse(t *testing.T) {
	universe := map[string]bool{}
	if err := forEachCSVRow(
		filepath.Join("..", "..", "data", "ingredients.csv"),
		[]string{"name"},
		func(row map[string]string) error {
			universe[row["name"]] = true
			return nil
		}); err != nil {
		t.Fatalf("load ingredients.csv: %v", err)
	}
	priced := map[string]bool{}
	if err := forEachCSVRow(
		filepath.Join("..", "..", "data", "cost", "prices.csv"),
		[]string{"name", "usd_per_unit", "unit_basis", "source", "as_of"},
		func(row map[string]string) error {
			if priced[row["name"]] {
				t.Errorf("duplicate price row %q", row["name"])
			}
			priced[row["name"]] = true
			if row["source"] == "" || row["as_of"] == "" {
				t.Errorf("price row %q missing source/as_of", row["name"])
			}
			return nil
		}); err != nil {
		t.Fatalf("load prices.csv: %v", err)
	}
	for name := range universe {
		if !priced[name] {
			t.Errorf("universe ingredient %q has no price row", name)
		}
	}
	for name := range priced {
		if !universe[name] {
			t.Errorf("price row %q is outside the universe", name)
		}
	}
}

// synthetic fixtures exercising the per_unit whole-portion requirement.
const testPricesCSV = `name,usd_per_unit,unit_basis,source,as_of
widget fruit,0.5000,per_100g,synthetic,2026-07
each melon,2.0000,per_unit,synthetic,2026-07
unit fruit,0.7500,per_unit,synthetic,2026-07
`

// widget fruit: "2 cup = 300 g"; each melon: "1 whole = 500 g";
// unit fruit has NO whole row (cup only).
const testCostPortionsCSV = `name,fdc_id,source_dataset,amount,unit,portion_description,gram_weight
widget fruit,900001,sr_legacy,2,cup,"cup, chopped",300
each melon,900003,sr_legacy,1,whole,whole,500
unit fruit,900004,sr_legacy,1,cup,cup,130
`

func writeCostFixtures(t *testing.T, prices string) *TableCost {
	t.Helper()
	dir := t.TempDir()
	pp := filepath.Join(dir, "prices.csv")
	op := filepath.Join(dir, "portions.csv")
	if err := os.WriteFile(pp, []byte(prices), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(op, []byte(testCostPortionsCSV), 0o644); err != nil {
		t.Fatal(err)
	}
	c, err := NewTableCost(pp, op)
	if err != nil {
		t.Fatalf("NewTableCost(synthetic): %v", err)
	}
	return c
}

func TestTableCostSynthetic(t *testing.T) {
	c := writeCostFixtures(t, testPricesCSV)
	tests := []struct {
		name string
		d    draft.Draft
		want draft.CostAnalysis
	}{
		{
			// 1 cup = 150 g at $0.50/100g.
			name: "per_100g through a household portion",
			d:    nutritionDraft(1, draft.Ingredient{Name: "widget fruit", Qty: 1, Unit: "cup"}),
			want: draft.CostAnalysis{
				TotalUSD: 0.75, PerServingUSD: 0.75,
				Approximate: true, Missing: []string{},
			},
		},
		{
			// 250 g of a $2/unit food weighing 500 g/whole = half a unit.
			name: "per_unit from a mass quantity",
			d:    nutritionDraft(1, draft.Ingredient{Name: "each melon", Qty: 250, Unit: "g"}),
			want: draft.CostAnalysis{
				TotalUSD: 1.00, PerServingUSD: 1.00,
				Approximate: true, Missing: []string{},
			},
		},
		{
			// a per_unit price without a "whole" portion row has no unit
			// count to multiply — unpriceable, never guessed.
			name: "per_unit without a whole portion row is footnoted",
			d:    nutritionDraft(1, draft.Ingredient{Name: "unit fruit", Qty: 1, Unit: "cup"}),
			want: draft.CostAnalysis{Approximate: true, Missing: []string{"unit fruit"}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := c.Compute(tt.d)
			if err != nil {
				t.Fatalf("Compute error: %v", err)
			}
			approxCost(t, got, tt.want)
		})
	}
}

func TestNewTableCostErrors(t *testing.T) {
	tests := []struct {
		name   string
		prices string
	}{
		{
			name: "unknown unit_basis",
			prices: "name,usd_per_unit,unit_basis,source,as_of\n" +
				"widget fruit,0.5,per_lb,synthetic,2026-07\n",
		},
		{
			name: "zero price",
			prices: "name,usd_per_unit,unit_basis,source,as_of\n" +
				"widget fruit,0,per_100g,synthetic,2026-07\n",
		},
		{
			name: "negative price",
			prices: "name,usd_per_unit,unit_basis,source,as_of\n" +
				"widget fruit,-1.5,per_100g,synthetic,2026-07\n",
		},
		{
			name: "unparsable price",
			prices: "name,usd_per_unit,unit_basis,source,as_of\n" +
				"widget fruit,cheap,per_100g,synthetic,2026-07\n",
		},
		{
			name: "duplicate name",
			prices: "name,usd_per_unit,unit_basis,source,as_of\n" +
				"widget fruit,0.5,per_100g,synthetic,2026-07\n" +
				"Widget Fruits,0.6,per_100g,synthetic,2026-07\n",
		},
		{
			name:   "missing required column",
			prices: "name,usd_per_unit\nwidget fruit,0.5\n",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			pp := filepath.Join(dir, "prices.csv")
			op := filepath.Join(dir, "portions.csv")
			if err := os.WriteFile(pp, []byte(tt.prices), 0o644); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(op, []byte(testCostPortionsCSV), 0o644); err != nil {
				t.Fatal(err)
			}
			if _, err := NewTableCost(pp, op); err == nil {
				t.Fatal("want error, got nil")
			}
		})
	}
	if _, err := NewTableCost("does-not-exist.csv", "also-missing.csv"); err == nil {
		t.Fatal("want error for missing files, got nil")
	}
}
