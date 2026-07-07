package grounding

import "strings"

// Stub is the canned Phase-1 Grounding: small fixed pairing and resolution
// tables, deterministic for any input. The real FlavorGraph + USDA/FoodOn
// data replace it in phase 2 behind the same interface. All ids and scores
// below are placeholders, not vendored data.
type Stub struct{}

var _ Grounding = Stub{}

// stubPairings holds the canned top pairings per known ingredient.
var stubPairings = map[string][]Pairing{
	"carrot":       {{"cumin", 0.92}, {"orange", 0.88}, {"yogurt", 0.81}},
	"garlic":       {{"thyme", 0.90}, {"olive oil", 0.86}, {"lemon", 0.79}},
	"tomato":       {{"basil", 0.95}, {"mozzarella", 0.89}, {"olive oil", 0.84}},
	"greek yogurt": {{"dill", 0.87}, {"cucumber", 0.85}, {"honey", 0.78}},
	"lemon":        {{"parsley", 0.83}, {"black pepper", 0.77}},
}

// Suggest returns the canned pairings for each known input name in input
// order, deduplicated on the suggested ingredient, capped at 10. Unknown
// names contribute nothing.
func (Stub) Suggest(ingredients []string) []Pairing {
	var out []Pairing
	seen := make(map[string]bool)
	for _, name := range ingredients {
		for _, p := range stubPairings[normalize(name)] {
			if seen[p.Ingredient] {
				continue
			}
			if len(out) == 10 {
				return out
			}
			seen[p.Ingredient] = true
			out = append(out, p)
		}
	}
	return out
}

// stubEntity is one canned resolution row, pointer-free so every Resolve
// call hands out fresh pointers the caller cannot alias.
type stubEntity struct{ fdcID, foodOnID, canonical string }

var stubEntities = map[string]stubEntity{
	"carrot":       {"fdc-2258586", "FOODON_03411343", "carrot, raw"},
	"garlic":       {"fdc-1104647", "FOODON_03301844", "garlic, raw"},
	"tomato":       {"fdc-2345232", "FOODON_03309927", "tomato, red, ripe, raw"},
	"greek yogurt": {"fdc-2259793", "FOODON_03304644", "yogurt, greek, plain, whole milk"},
	"olive oil":    {"fdc-1750351", "FOODON_03305263", "oil, olive, extra virgin"},
}

// stubAliases maps common aliases onto canned entity keys.
var stubAliases = map[string]string{
	"carrots":      "carrot",
	"garlic clove": "garlic",
	"tomatoes":     "tomato",
	"yogurt":       "greek yogurt",
	"evoo":         "olive oil",
}

// Resolve looks the normalized name up directly, then through the alias
// table.
func (Stub) Resolve(name string) (Resolution, bool) {
	key := normalize(name)
	if alias, ok := stubAliases[key]; ok {
		key = alias
	}
	e, ok := stubEntities[key]
	if !ok {
		return Resolution{}, false
	}
	fdc, foodOn := e.fdcID, e.foodOnID
	return Resolution{FDCID: &fdc, FoodOnID: &foodOn, Canonical: e.canonical}, true
}

// normalize lower-cases and trims a name for table lookup.
func normalize(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}
