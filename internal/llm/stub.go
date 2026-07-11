package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/ogngnaoh/capycook/internal/draft"
	"github.com/ogngnaoh/capycook/internal/proposal"
)

// Stub is the deterministic Phase-1 LLM: one canned template per move type
// builds a plausible modified Draft, and Go computes the Change diff — the
// same shape the real DeepSeek path produces in phase 3. Output depends
// only on the request, so tests and the eval dry-run are reproducible.
//
// Seeded unsafe case: a steer containing "garlic oil" (case-insensitive)
// makes the proposed draft gain a garlic ingredient plus a room-temperature
// garlic-in-oil infuse_oil step, so the safety stub can block it.
type Stub struct {
	// Latency, when nonzero, delays each GenerateMove so the proposing
	// state stays on screen long enough for demo capture
	// (CAPYCOOK_STUB_LATENCY_MS, server-only). The wait is context-aware:
	// a cancel mid-wait returns at once, so the Stop button really stops.
	Latency time.Duration
}

var _ LLM = Stub{}

// GenerateMove renders the move type's template against req.Draft. Unknown
// move types error; ID/MoveID and Safety stay zero (the orchestrator and
// the safety gate own them).
func (s Stub) GenerateMove(ctx context.Context, req MoveRequest) (proposal.Proposal, error) {
	if err := ctx.Err(); err != nil {
		return proposal.Proposal{}, err
	}
	if s.Latency > 0 {
		t := time.NewTimer(s.Latency)
		defer t.Stop()
		select {
		case <-ctx.Done():
			return proposal.Proposal{}, ctx.Err()
		case <-t.C:
		}
	}
	tmpl, ok := templates[req.MoveType]
	if !ok {
		return proposal.Proposal{}, fmt.Errorf("llm: unknown move type %q", req.MoveType)
	}
	proposed := clone(req.Draft)
	before := len(proposed.FlavorRationale)
	tmpl.mutate(&proposed)
	// Seeded steer fixtures (case-insensitive contains on req.Steer, any LLM
	// move type): each drives one deterministic contract rule so the behavior
	// oracle (B2) can exercise it end-to-end. garlic oil is the original
	// anaerobic case; peanut/rare chicken feed the two remaining safety rules,
	// saffron the unpriced-cost path, moonshot the low-confidence gate.
	steer := strings.ToLower(req.Steer)
	if strings.Contains(steer, "garlic oil") {
		addGarlicOil(&proposed)
	}
	if strings.Contains(steer, "peanut") {
		addPeanut(&proposed)
	}
	if strings.Contains(steer, "rare chicken") {
		addUndercookedChicken(&proposed)
	}
	if strings.Contains(steer, "saffron") {
		addSaffron(&proposed)
	}
	if strings.Contains(steer, "spring clean") {
		springClean(&proposed)
	}
	confidence := 0.6
	if strings.Contains(steer, "moonshot") {
		confidence = 0.15
	}
	// Pinned-vocabulary provenance (Amendment 1 / Tier-1 dry-run coverage):
	// flavor claims appended by this move cite the first supplied pairing,
	// exactly as the prompt contract instructs the live model to.
	if len(req.Evidence.Pairings) > 0 && len(proposed.FlavorRationale) > before {
		ref := "pairing:" + req.Evidence.Pairings[0].Ingredient
		for i := before; i < len(proposed.FlavorRationale); i++ {
			proposed.FlavorRationale[i].Provenance = &ref
		}
	}
	change := proposal.ComputeDiff(req.Draft, proposed)
	rationale := tmpl.rationale
	if req.Steer != "" {
		rationale += fmt.Sprintf(" Steer applied: %q.", req.Steer)
	}
	return proposal.Proposal{
		MoveType:      req.MoveType,
		TargetFields:  proposal.TargetFields(change),
		Change:        change,
		Rationale:     rationale,
		Citations:     []proposal.Citation{{Source: "stub", Ref: "template:" + req.MoveType, Date: "2026-07-06"}},
		Confidence:    confidence,
		Unverified:    []string{"templated stub output — flavor claims unchecked"},
		SuggestedNext: tmpl.next,
	}, nil
}

// moveTemplate is one canned move: an in-place mutation of a cloned draft,
// fixed rationale prose, and the suggested follow-up moves.
type moveTemplate struct {
	mutate    func(d *draft.Draft)
	rationale string
	next      []string
}

var templates = map[string]moveTemplate{
	MoveTypeSeedExpand: {
		mutate: func(d *draft.Draft) {
			if d.Title == "" {
				d.Title = "Charred Carrot Salad with Herb Yogurt"
			}
			if d.Concept == "" {
				d.Concept = "sweet charred carrots against a cold, sharp yogurt base"
			}
			d.Ingredients = append(d.Ingredients,
				draft.Ingredient{Name: "olive oil", Qty: 30, Unit: "ml"},
				draft.Ingredient{Name: "flat-leaf parsley", Qty: 10, Unit: "g"},
			)
			d.Steps = append(d.Steps,
				draft.Step{Text: "Toss everything with olive oil and season before roasting.", Technique: "raw", Why: "even seasoning and browning"},
				draft.Step{Text: "Scatter parsley over the plate just before serving.", Technique: "raw", Why: "fresh lift against the char"},
			)
			d.FlavorRationale = append(d.FlavorRationale, draft.FlavorClaim{
				Claim:          "char bitterness wants a fresh herbal counterpoint",
				CuisineContext: d.Constraints.Cuisine,
			})
		},
		rationale: "Expanded the seed into a fuller first draft: an oil-and-season base step for even browning and a fresh herb finish against the char.",
		next:      []string{MoveTypeFlavorDirection, MoveTypeIngredientChange, MoveTypeTechniqueStep},
	},
	MoveTypeFlavorDirection: {
		mutate: func(d *draft.Draft) {
			d.Concept = strings.TrimSpace(d.Concept + " (leaning smoky-sweet)")
			d.Ingredients = append(d.Ingredients, draft.Ingredient{Name: "smoked paprika", Qty: 2, Unit: "tsp"})
			d.FlavorRationale = append(d.FlavorRationale, draft.FlavorClaim{
				Claim:          "smoked paprika deepens the roasted, caramel-sweet notes",
				CuisineContext: d.Constraints.Cuisine,
			})
		},
		rationale: "Leaned the flavor smoky-sweet: smoked paprika reinforces the roasted notes already in the draft.",
		next:      []string{MoveTypeIngredientChange, MoveTypeTechniqueStep},
	},
	MoveTypeIngredientChange: {
		mutate: func(d *draft.Draft) {
			sub := draft.Ingredient{Name: "shallot", Qty: 2, Unit: "whole"}
			if len(d.Ingredients) == 0 {
				d.Ingredients = append(d.Ingredients, sub)
				return
			}
			d.Ingredients[0] = sub
		},
		rationale: "Swapped the lead ingredient for shallot: milder allium sweetness that keeps the profile intact.",
		next:      []string{MoveTypeTechniqueStep, MoveTypeCostRecompute},
	},
	MoveTypeTechniqueStep: {
		mutate: func(d *draft.Draft) {
			d.Steps = append(d.Steps, draft.Step{
				Text:      "Finish under a hot broiler for two minutes.",
				Technique: "roast",
				Why:       "adds edge char without overcooking the interior",
			})
		},
		rationale: "Added a broiler finish: two minutes of top heat adds char without overcooking.",
		next:      []string{MoveTypeIterateFeedback, MoveTypeNutritionRecompute},
	},
	MoveTypeIterateFeedback: {
		mutate: func(d *draft.Draft) {
			d.Concept = strings.TrimSpace(d.Concept + " (brightened per feedback)")
			d.Ingredients = append(d.Ingredients, draft.Ingredient{Name: "lemon", Qty: 1, Unit: "whole"})
			d.Steps = append(d.Steps, draft.Step{
				Text:      "Squeeze lemon over the dish just before serving.",
				Technique: "raw",
				Why:       "acid lifts the finish",
			})
		},
		rationale: "Brightened the dish per feedback: a squeeze of lemon just before serving lifts the finish.",
		next:      []string{MoveTypeTechniqueStep, MoveTypeScaleServings, MoveTypeCostRecompute},
	},
	MoveTypeScaleServings: {
		mutate: func(d *draft.Draft) {
			d.Constraints.Servings = max(1, d.Constraints.Servings) * 2
			for i := range d.Ingredients {
				d.Ingredients[i].Qty *= 2
			}
		},
		rationale: "Doubled the batch: servings and every ingredient quantity scaled by two.",
		next:      []string{MoveTypeCostRecompute, MoveTypeNutritionRecompute},
	},
	MoveTypeUnitConvert: {
		mutate: func(d *draft.Draft) {
			for i := range d.Ingredients {
				switch d.Ingredients[i].Unit {
				case "g":
					d.Ingredients[i].Qty /= 1000
					d.Ingredients[i].Unit = "kg"
				case "ml":
					d.Ingredients[i].Qty /= 1000
					d.Ingredients[i].Unit = "l"
				}
			}
		},
		rationale: "Converted metric bulk units: grams to kilograms and millilitres to litres where present.",
		next:      []string{MoveTypeScaleServings, MoveTypeCostRecompute},
	},
	MoveTypeCostRecompute: {
		mutate: func(d *draft.Draft) {
			d.Analysis.Cost = draft.CostAnalysis{TotalUSD: 11.9, PerServingUSD: 5.95, Approximate: true, Missing: []string{}}
		},
		rationale: "Refreshed the cost panel with placeholder stub numbers.",
		next:      []string{MoveTypeNutritionRecompute, MoveTypeIterateFeedback},
	},
	MoveTypeNutritionRecompute: {
		mutate: func(d *draft.Draft) {
			d.Analysis.Nutrition = draft.NutritionAnalysis{
				Calories: 480, ProteinG: 21, FatG: 17, SatFatG: 5,
				CarbsG: 58, FiberG: 9, SugarG: 13, SodiumMg: 610,
				Unverified: []string{
					"calories", "protein_g", "fat_g", "sat_fat_g",
					"carbs_g", "fiber_g", "sugar_g", "sodium_mg",
				},
			}
		},
		rationale: "Refreshed the nutrition panel with placeholder stub numbers.",
		next:      []string{MoveTypeCostRecompute, MoveTypeIterateFeedback},
	},
}

// addGarlicOil injects the seeded unsafe case: raw garlic left in oil at
// room temperature (Clostridium botulinum risk) — exactly what the safety
// stub's anaerobic-garlic-oil rule blocks.
func addGarlicOil(d *draft.Draft) {
	d.Ingredients = append(d.Ingredients, draft.Ingredient{Name: "garlic", Qty: 4, Unit: "clove"})
	d.Steps = append(d.Steps, draft.Step{
		Text:      "Crush the garlic cloves, submerge them in olive oil, and leave the jar at room temperature for two days to infuse.",
		Technique: "infuse_oil",
		Why:       "slow room-temperature infusion carries the garlic through the oil",
	})
}

// addPeanut injects a Big-9 peanut allergen: "peanut butter" resolves in the
// FoodOn closure table (data/foodon/allergens.csv) to the "peanuts" class, so
// a dish that declares a peanut allergen constraint blocks — the allergen
// half of the deterministic safety gate (BC-C-15). Steer keyword: "peanut".
func addPeanut(d *draft.Draft) {
	d.Ingredients = append(d.Ingredients, draft.Ingredient{Name: "peanut butter", Qty: 30, Unit: "g"})
}

// addUndercookedChicken injects an under-temperature high-risk protein: a
// chicken breast (poultry, FSIS 74 C / 165 F minimum per
// data/safety/protein_classes.csv + min_temps.csv) whose only cooking step
// states an internal temperature of 55 C — below the minimum — so the safety
// gate's min-temp rule blocks (BC-C-15). Steer keyword: "rare chicken".
func addUndercookedChicken(d *draft.Draft) {
	temp := 55.0
	d.Ingredients = append(d.Ingredients, draft.Ingredient{Name: "chicken breast", Qty: 300, Unit: "g"})
	d.Steps = append(d.Steps, draft.Step{
		Text:          "Sear the chicken breast in a hot pan, pulling it at 55 C so the centre stays pink.",
		Technique:     "fry",
		InternalTempC: &temp,
		Why:           "keeps the meat rare and juicy",
	})
}

// addSaffron injects an ingredient absent from the price table
// (data/cost/prices.csv), so a cost recompute footnotes it in
// analysis.cost.missing. ⚠ saffron is also ungrounded in the FoodOn subset,
// and the allergen gate fails closed on unknown ingredients — on a dish that
// declares any allergen constraint this move trips a safety hold ("allergen
// status unknown"), which is correct gate behavior. Use it only on dishes
// with no declared allergens; BC-D-10's allergen-declared recipe is served
// by the ordinary seed_expand template's unpriced parsley instead
// (2026-07-11 area-D oracle finding). Steer keyword: "saffron".
func addSaffron(d *draft.Draft) {
	d.Ingredients = append(d.Ingredients, draft.Ingredient{Name: "saffron", Qty: 1, Unit: "pinch"})
}

// springClean injects the three diff shapes BC-C-16 needs from a single
// proposal — an add, an in-place change, and a remove — that no plain
// template produces on its own: it appends one inert grounded ingredient
// (carrot: priced and allergen-resolved, tripping no safety rule), rewrites
// an EXISTING step in place (a replace op on a /steps/N path, not an append),
// and drops one EXISTING flavor_rationale entry (a remove op on a
// /flavor_rationale path). The modify/remove halves are guarded so a draft
// with no steps or no flavor claims never panics. Steer keyword: "spring
// clean".
func springClean(d *draft.Draft) {
	d.Ingredients = append(d.Ingredients, draft.Ingredient{Name: "carrot", Qty: 100, Unit: "g"})
	if len(d.Steps) > 0 {
		d.Steps[0].Text = "Wipe down the board and reset the mise en place before the first cook."
		d.Steps[0].Why = "a clean spring reset keeps the following steps tidy"
	}
	if n := len(d.FlavorRationale); n > 0 {
		d.FlavorRationale = d.FlavorRationale[:n-1]
	}
}

// clone deep-copies a Draft through JSON so template mutations never touch
// the caller's slices.
func clone(d draft.Draft) draft.Draft {
	raw, err := json.Marshal(d)
	if err != nil {
		panic(fmt.Sprintf("llm: marshal draft: %v", err)) // unreachable: Draft is plain data
	}
	var out draft.Draft
	if err := json.Unmarshal(raw, &out); err != nil {
		panic(fmt.Sprintf("llm: unmarshal draft: %v", err)) // unreachable: input is json.Marshal output
	}
	return out
}
