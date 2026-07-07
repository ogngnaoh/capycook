// Package draft is the git-style versioned dish draft: the shared artifact
// the cook and the model iterate on (P0-A; DESIGN §8.3, SPEC §5 schema
// split). Drafts are immutable values: Apply returns a new Draft and never
// modifies its receiver.
package draft

// Ingredient is one line of the ingredient list. FDCID and FoodOnID stay
// nil until grounding resolves the name (grounded arm only).
type Ingredient struct {
	Name     string  `json:"name"`
	FDCID    *string `json:"fdc_id"`    // nullable — USDA resolution
	FoodOnID *string `json:"foodon_id"` // nullable — FoodOn resolution
	Qty      float64 `json:"qty"`
	Unit     string  `json:"unit"`
}

// Step is one instruction in the method.
type Step struct {
	Text          string   `json:"text"`
	Technique     string   `json:"technique"`       // enum: saute|roast|boil|simmer|bake|grill|fry|raw|cure|ferment|can|infuse_oil|sous_vide|other
	InternalTempC *float64 `json:"internal_temp_c"` // nullable; REQUIRED by prompt for high-risk proteins
	Why           string   `json:"why"`
}

// FlavorClaim is one entry of the draft's flavor rationale.
type FlavorClaim struct {
	Claim          string  `json:"claim"`
	Provenance     *string `json:"provenance"`      // nil => [unverified]
	CuisineContext string  `json:"cuisine_context"` // copies constraints.cuisine
}

// Constraints is the cook's standing constraint set for the dish.
type Constraints struct {
	Dietary   []string `json:"dietary"`
	Allergens []string `json:"allergens"` // FDA Big-9 enum values only
	Equipment []string `json:"equipment"`
	Skill     string   `json:"skill"` // beginner|intermediate|advanced
	Servings  int      `json:"servings"`
	OnHand    []string `json:"on_hand"`
	Cuisine   string   `json:"cuisine"` // enum, v0: "western"
}

// CostAnalysis is the per-dish cost estimate (spec §5). Ingredients that
// cannot be priced are listed in Missing and excluded from the totals — a
// missing ingredient is never counted as $0.
type CostAnalysis struct {
	TotalUSD      float64  `json:"total_usd"`
	PerServingUSD float64  `json:"per_serving_usd"`
	Approximate   bool     `json:"approximate"` // always true in v0
	Missing       []string `json:"missing"`     // excluded-from-total footnote
}

// NutritionAnalysis is the per-serving nutrition panel (spec §5).
// Unverified carries field-level [unverified] markers.
type NutritionAnalysis struct {
	Calories   float64  `json:"calories"`
	ProteinG   float64  `json:"protein_g"`
	FatG       float64  `json:"fat_g"`
	SatFatG    float64  `json:"sat_fat_g"`
	CarbsG     float64  `json:"carbs_g"`
	FiberG     float64  `json:"fiber_g"`
	SugarG     float64  `json:"sugar_g"`
	SodiumMg   float64  `json:"sodium_mg"`
	Unverified []string `json:"unverified"`
}

// Analysis bundles the deterministic per-draft computations.
type Analysis struct {
	Cost      CostAnalysis      `json:"cost"`      // per-dish + per-serving, [approximate]
	Nutrition NutritionAnalysis `json:"nutrition"` // per-serving panel (spec §5)
}

// Draft is the versioned dish artifact.
type Draft struct {
	Title           string        `json:"title"`
	Concept         string        `json:"concept"`
	FlavorRationale []FlavorClaim `json:"flavor_rationale"`
	Ingredients     []Ingredient  `json:"ingredients"`
	Steps           []Step        `json:"steps"`
	Constraints     Constraints   `json:"constraints"`
	Analysis        Analysis      `json:"analysis"`
}
