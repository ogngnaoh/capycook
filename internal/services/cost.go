package services

import (
	"fmt"
	"strconv"

	"github.com/ogngnaoh/capycook/internal/draft"
)

// data/cost/prices.csv unit_basis vocabulary.
const (
	basisPer100g = "per_100g" // usd_per_unit is USD per 100 g
	basisPerUnit = "per_unit" // usd_per_unit is USD per whole item (e.g. egg)
)

// TableCost computes the per-dish + per-serving cost estimate from the
// committed [approximate] price table (data/cost/prices.csv, provenance and
// tier split in data/cost/PROVENANCE.md — deliberately NOT USDA-attributed).
// Quantities pro-rate through the same gram-mass machinery as nutrition
// (PortionTable, units.go): per_100g rows scale by the resolved gram mass;
// per_unit rows divide that mass by the food's "1 whole" portion weight to
// recover a unit count. An ingredient with no price row or no usable
// conversion is EXCLUDED from the totals and listed in CostAnalysis.Missing
// (the UI footnote) — it is never priced as $0. Approximate is always true.
//
// Lookup is by normalized name only (the table carries no FDC/FoodOn ids);
// alias resolution stays the grounding resolver's job, as with nutrition.
type TableCost struct {
	prices   map[string]priceRow // normalized universe name -> row
	portions *PortionTable
}

type priceRow struct {
	name  string  // canonical universe name (the portions join key)
	usd   float64 // > 0, enforced at load
	basis string  // basisPer100g | basisPerUnit
}

var _ Cost = (*TableCost)(nil)

// NewTableCost loads the committed price table and the vendored USDA
// portions table, rejecting rows outside the basis vocabulary, non-positive
// prices, and duplicate names — a malformed table is a data bug, not a
// runtime fallback.
func NewTableCost(pricesPath, portionsPath string) (*TableCost, error) {
	c := &TableCost{prices: make(map[string]priceRow)}
	if err := forEachCSVRow(pricesPath,
		[]string{"name", "usd_per_unit", "unit_basis"},
		func(row map[string]string) error {
			usd, err := strconv.ParseFloat(row["usd_per_unit"], 64)
			if err != nil {
				return fmt.Errorf("bad usd_per_unit for %q: %w", row["name"], err)
			}
			if usd <= 0 {
				return fmt.Errorf("non-positive usd_per_unit %v for %q", usd, row["name"])
			}
			basis := row["unit_basis"]
			if basis != basisPer100g && basis != basisPerUnit {
				return fmt.Errorf("unknown unit_basis %q for %q", basis, row["name"])
			}
			key := normalizeName(row["name"])
			if _, dup := c.prices[key]; dup {
				return fmt.Errorf("duplicate price row for %q", row["name"])
			}
			c.prices[key] = priceRow{name: row["name"], usd: usd, basis: basis}
			return nil
		}); err != nil {
		return nil, fmt.Errorf("cost: load prices: %w", err)
	}
	portions, err := NewPortionTable(portionsPath)
	if err != nil {
		return nil, fmt.Errorf("cost: %w", err)
	}
	c.portions = portions
	return c, nil
}

// Compute sums line costs over the draft's ingredients; PerServingUSD
// divides by servings (<=0 treated as 1). Unpriceable ingredients are
// footnoted in Missing (deduplicated, first-seen order, the draft's own
// spelling) and contribute nothing.
func (c *TableCost) Compute(d draft.Draft) (draft.CostAnalysis, error) {
	servings := d.Constraints.Servings
	if servings <= 0 {
		servings = 1
	}
	missing := []string{}
	footnoted := make(map[string]bool)
	var total float64
	for _, ing := range d.Ingredients {
		row, ok := c.prices[normalizeName(ing.Name)]
		var usd float64
		if ok {
			usd, ok = c.lineUSD(row, ing)
		}
		if !ok {
			if !footnoted[ing.Name] {
				footnoted[ing.Name] = true
				missing = append(missing, ing.Name)
			}
			continue
		}
		total += usd
	}
	return draft.CostAnalysis{
		TotalUSD:      total,
		PerServingUSD: total / float64(servings),
		Approximate:   true,
		Missing:       missing,
	}, nil
}

// lineUSD prices one ingredient line, reporting ok=false when no
// portions-table path exists from the draft's quantity to the price basis.
func (c *TableCost) lineUSD(row priceRow, ing draft.Ingredient) (float64, bool) {
	grams, err := c.portions.GramMass(row.name, ing.Qty, ing.Unit)
	if err != nil {
		return 0, false
	}
	if row.basis == basisPerUnit {
		perWhole, err := c.portions.GramMass(row.name, 1, "whole")
		if err != nil || perWhole <= 0 {
			return 0, false
		}
		return grams / perWhole * row.usd, true
	}
	return grams / 100 * row.usd, true
}
