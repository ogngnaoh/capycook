package services

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/ogngnaoh/capycook/internal/draft"
)

// USDANutrition computes the per-serving nutrition panel from the vendored
// USDA FoodData Central subset (data/usda/, provenance in its PROVENANCE.md):
// per-serving value = sum over ingredients of (per-100g value x gram mass /
// 100) / servings. Gram mass resolves through the shared PortionTable hook
// (units.go): mass units directly, every household or volume measure ONLY
// through the vendored FDC foodPortion table. An ingredient with no USDA
// match or no usable conversion contributes nothing and adds field-level
// [unverified] markers — values are never guessed.
type USDANutrition struct {
	byName   map[string]usdaFood // normalized universe name -> food
	byFDCID  map[string]usdaFood // fdc_id -> food
	portions *PortionTable
}

var _ Nutrition = (*USDANutrition)(nil)

// nutritionFields is the canonical panel field order; the names double as
// the [unverified] marker vocabulary (matching NutritionAnalysis JSON tags).
var nutritionFields = [8]string{
	"calories", "protein_g", "fat_g", "sat_fat_g",
	"carbs_g", "fiber_g", "sugar_g", "sodium_mg",
}

// nutrientColumns maps panel slots to data/usda/nutrients.csv columns.
var nutrientColumns = [8]string{
	"calories_kcal", "protein_g", "fat_g", "sat_fat_g",
	"carbs_g", "fiber_g", "sugar_g", "sodium_mg",
}

type usdaFood struct {
	name    string      // canonical universe name (portions join key)
	per100g [8]*float64 // nil = value absent upstream (never imputed)
}

// NewUSDANutrition loads the vendored nutrient and portion tables.
func NewUSDANutrition(nutrientsPath, portionsPath string) (*USDANutrition, error) {
	n := &USDANutrition{
		byName:  make(map[string]usdaFood),
		byFDCID: make(map[string]usdaFood),
	}
	if err := forEachCSVRow(nutrientsPath,
		[]string{"name", "fdc_id"},
		func(row map[string]string) error {
			food := usdaFood{name: row["name"]}
			for i, col := range nutrientColumns {
				cell := strings.TrimSpace(row[col])
				if cell == "" {
					continue
				}
				v, err := strconv.ParseFloat(cell, 64)
				if err != nil {
					return fmt.Errorf("bad %s for %q: %w", col, row["name"], err)
				}
				food.per100g[i] = &v
			}
			n.byName[normalizeName(row["name"])] = food
			n.byFDCID[row["fdc_id"]] = food
			return nil
		}); err != nil {
		return nil, fmt.Errorf("nutrition: load nutrients: %w", err)
	}
	portions, err := NewPortionTable(portionsPath)
	if err != nil {
		return nil, fmt.Errorf("nutrition: %w", err)
	}
	n.portions = portions
	return n, nil
}

// Compute sums per-100g panel values over the draft's ingredients and
// divides by servings (<=0 treated as 1). Failures to resolve or convert an
// ingredient surface as field-level markers in Unverified, never as guesses.
func (n *USDANutrition) Compute(d draft.Draft) (draft.NutritionAnalysis, error) {
	servings := d.Constraints.Servings
	if servings <= 0 {
		servings = 1
	}
	var totals [8]float64
	var unverified [8]bool
	for _, ing := range d.Ingredients {
		food, ok := n.lookup(ing)
		if !ok {
			for i := range unverified {
				unverified[i] = true
			}
			continue
		}
		grams, err := n.portions.GramMass(food.name, ing.Qty, ing.Unit)
		if err != nil {
			for i := range unverified {
				unverified[i] = true
			}
			continue
		}
		for i, v := range food.per100g {
			if v == nil {
				unverified[i] = true
				continue
			}
			totals[i] += *v * grams / 100
		}
	}
	out := draft.NutritionAnalysis{
		Calories: totals[0] / float64(servings),
		ProteinG: totals[1] / float64(servings),
		FatG:     totals[2] / float64(servings),
		SatFatG:  totals[3] / float64(servings),
		CarbsG:   totals[4] / float64(servings),
		FiberG:   totals[5] / float64(servings),
		SugarG:   totals[6] / float64(servings),
		SodiumMg: totals[7] / float64(servings),
	}
	for i, flagged := range unverified {
		if flagged {
			out.Unverified = append(out.Unverified, nutritionFields[i])
		}
	}
	return out, nil
}

// lookup keys on Ingredient.FDCID when set (grounding.Resolve fills it in
// the grounded arm), falling back to a normalized-name match. Alias
// resolution is deliberately NOT done here — that is the grounding
// resolver's job (simple normalization only).
func (n *USDANutrition) lookup(ing draft.Ingredient) (usdaFood, bool) {
	if ing.FDCID != nil && *ing.FDCID != "" {
		food, ok := n.byFDCID[*ing.FDCID]
		return food, ok
	}
	food, ok := n.byName[normalizeName(ing.Name)]
	return food, ok
}

// normalizeName is the simple normalization shared with the vendoring
// matcher: lowercase, collapse whitespace, naive-singularize each token.
func normalizeName(s string) string {
	tokens := strings.Fields(strings.ToLower(strings.TrimSpace(s)))
	for i, t := range tokens {
		tokens[i] = singularizeToken(t)
	}
	return strings.Join(tokens, " ")
}

// singularizeToken applies the same naive plural rules as the vendoring
// script's matcher (scripts/vendor_usda.py) so both sides normalize alike.
func singularizeToken(t string) string {
	switch {
	case len(t) > 3 && strings.HasSuffix(t, "ies"):
		return t[:len(t)-3] + "y"
	case len(t) > 3 && (strings.HasSuffix(t, "oes") ||
		strings.HasSuffix(t, "shes") || strings.HasSuffix(t, "ches") ||
		strings.HasSuffix(t, "sses") || strings.HasSuffix(t, "xes") ||
		strings.HasSuffix(t, "zes")):
		return t[:len(t)-2]
	case len(t) > 2 && strings.HasSuffix(t, "s") && !strings.HasSuffix(t, "ss"):
		return t[:len(t)-1]
	}
	return t
}

// forEachCSVRow streams a headered CSV, requiring the named columns and
// passing each row to fn as a column->value map.
func forEachCSVRow(path string, required []string, fn func(map[string]string) error) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	r := csv.NewReader(f)
	header, err := r.Read()
	if err != nil {
		return fmt.Errorf("read header of %s: %w", path, err)
	}
	col := make(map[string]int, len(header))
	for i, h := range header {
		col[h] = i
	}
	for _, want := range required {
		if _, ok := col[want]; !ok {
			return fmt.Errorf("%s: missing required column %q", path, want)
		}
	}
	for {
		rec, err := r.Read()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("read %s: %w", path, err)
		}
		row := make(map[string]string, len(header))
		for name, i := range col {
			if i < len(rec) {
				row[name] = rec[i]
			}
		}
		if err := fn(row); err != nil {
			return err
		}
	}
}
