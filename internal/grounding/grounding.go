// Package grounding is the deterministic retrieval layer: in-memory
// FlavorGraph vector lookup plus USDA/FoodOn entity resolution and
// claim-type routing (P0-6, P0-7; SPEC §3). Phase 1 ships the interface
// plus a canned stub; the vendored data lands in phase 2.
package grounding

// Pairing is one FlavorGraph pairing suggestion for an ingredient already
// in the draft.
type Pairing struct {
	Ingredient string
	Score      float64
}

// Resolution is a resolved ingredient entity: USDA FDC id and FoodOn id
// with the canonical name. Either pointer stays nil when that side has no
// match.
type Resolution struct {
	FDCID     *string
	FoodOnID  *string
	Canonical string
}

// Grounding is the deterministic retrieval edge (spec §4). Suggest returns
// the top-10 FlavorGraph pairings for the given ingredient names; Resolve
// maps one name to its canonical entity via normalized exact match plus an
// alias table.
type Grounding interface {
	Suggest(ingredients []string) []Pairing
	Resolve(name string) (Resolution, bool)
}
