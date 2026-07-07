package services

import (
	"fmt"
	"strings"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/proposal"
)

// AllergenChecker screens a draft's ingredients against the cook's declared
// FDA Big-9 allergen constraints using the FoodOn-derived closure table
// (data/foodon/allergens.csv, provenance in its PROVENANCE.md). It is the
// allergen half of the safety gate (spec §6), kept as an independently
// testable unit; safety.go (task 2.6) composes it.
//
// Fail-closed: with at least one allergen declared, an ingredient that cannot
// be resolved in the closure table is itself a block reason ("allergen status
// unknown for X") — an unknown ingredient is never assumed allergen-free.
type AllergenChecker struct {
	byName     map[string]map[string]bool // normalized universe name -> allergen set
	byFoodOnID map[string]map[string]bool // foodon_id -> allergen set
}

// big9Order is the canonical FDA Big-9 ordering; violations are reported in
// this order for deterministic output regardless of declared/ingredient order.
var big9Order = [9]string{
	"milk", "eggs", "fish", "crustacean shellfish", "tree nuts",
	"peanuts", "wheat", "soybeans", "sesame",
}

// NewAllergenChecker loads the vendored closure table. Every universe
// ingredient is a row (allergen set possibly empty); presence in the table is
// what makes an ingredient "resolved".
func NewAllergenChecker(allergensPath string) (*AllergenChecker, error) {
	a := &AllergenChecker{
		byName:     make(map[string]map[string]bool),
		byFoodOnID: make(map[string]map[string]bool),
	}
	if err := forEachCSVRow(allergensPath,
		[]string{"name", "foodon_id", "big9"},
		func(row map[string]string) error {
			set := make(map[string]bool)
			for _, tok := range strings.Split(row["big9"], ";") {
				tok = strings.TrimSpace(tok)
				if tok != "" {
					set[tok] = true
				}
			}
			a.byName[normalizeName(row["name"])] = set
			if id := strings.TrimSpace(row["foodon_id"]); id != "" {
				a.byFoodOnID[id] = set
			}
			return nil
		}); err != nil {
		return nil, fmt.Errorf("allergen: load closure table: %w", err)
	}
	return a, nil
}

// Check returns the allergen verdict for the draft: pass when no declared
// allergen is violated, blocked otherwise. With no declared allergens there is
// nothing to enforce and every draft passes. Reasons/RuleIDs list one entry
// per (ingredient, violated allergen) plus one per unresolved ingredient.
func (a *AllergenChecker) Check(d draft.Draft) proposal.Safety {
	declared := make(map[string]bool)
	for _, name := range d.Constraints.Allergens {
		declared[strings.ToLower(strings.TrimSpace(name))] = true
	}
	if len(declared) == 0 {
		return pass()
	}
	var reasons, ruleIDs []string
	for _, ing := range d.Ingredients {
		carried, resolved := a.lookup(ing)
		if !resolved {
			reasons = append(reasons, fmt.Sprintf("allergen status unknown for %s", ing.Name))
			ruleIDs = append(ruleIDs, "allergen-unresolved")
			continue
		}
		for _, allergen := range big9Order {
			if declared[allergen] && carried[allergen] {
				reasons = append(reasons, fmt.Sprintf("%s contains declared allergen %s", ing.Name, allergen))
				ruleIDs = append(ruleIDs, "allergen-"+strings.ReplaceAll(allergen, " ", "-"))
			}
		}
	}
	if len(reasons) == 0 {
		return pass()
	}
	return proposal.Safety{Status: "blocked", Reasons: reasons, RuleIDs: ruleIDs}
}

// lookup resolves an ingredient to its allergen set. It resolves by FoodOn id
// (set by the grounding resolver in the grounded arm) and by normalized name,
// and unions both — an ingredient is resolved when either key hits, and the
// union maximizes detection (the safe direction). Alias resolution is
// deliberately NOT done here (that is the grounding resolver's job, task 2.7):
// an unresolved name fails closed above.
func (a *AllergenChecker) lookup(ing draft.Ingredient) (map[string]bool, bool) {
	var carried map[string]bool
	resolved := false
	if ing.FoodOnID != nil && *ing.FoodOnID != "" {
		if set, ok := a.byFoodOnID[*ing.FoodOnID]; ok {
			carried, resolved = unionSets(carried, set), true
		}
	}
	if set, ok := a.byName[normalizeName(ing.Name)]; ok {
		carried, resolved = unionSets(carried, set), true
	}
	return carried, resolved
}

func unionSets(a, b map[string]bool) map[string]bool {
	if a == nil {
		return b
	}
	out := make(map[string]bool, len(a)+len(b))
	for k := range a {
		out[k] = true
	}
	for k := range b {
		out[k] = true
	}
	return out
}
