# data/ — pinned, provenance-cited assets

Canonical data for the deterministic side of CapyCook (DESIGN §10, SPEC §6,
end-to-end build spec §5). Every vendored asset lives in its own subdirectory
with a `PROVENANCE.md` (raw artifact URL, release/version date, SHA256) and a
license note; those land in later Phase-2 tasks (`usda/`, `foodon/`, `cost/`,
`safety/`, `flavorgraph/`). Bulk raw downloads are never committed — only
extracted subsets bounded by the ingredient universe below.

## ingredients.csv — canonical ingredient universe

The curated Western pantry vocabulary (~246 staples). It bounds the USDA row
extraction, the FoodOn allergen closure, and the cost table: downstream assets
vendor rows **only** for names in this file.

### Schema

| column | meaning |
|---|---|
| `name` | canonical ingredient name — lowercase, singular (e.g. `carrot`, `ground beef`) |
| `aliases` | semicolon-separated alternate names (`scallion` → `green onion;spring onion`); plural forms are NOT listed — the resolver (task 2.7) normalizes/singularizes before lookup |
| `category` | one of `produce\|protein\|dairy\|grain\|fat\|spice\|condiment\|baking\|other` |
| `big9_flags` | **placeholder, empty in every row** — the FoodOn transitive-closure mapping (task 2.4) fills it with FDA/FSIS Big-9 allergen classes: milk, eggs, fish, crustacean shellfish, tree nuts, peanuts, wheat, soybeans, sesame |

### Curation rules

- **Category = pantry/culinary role, not nutritional food group:** butter →
  `dairy` (not fat); nuts, seeds, eggs, tofu, beans/lentils → `protein`; nut
  butters/tahini → `condiment` (jarred spreads); flour, sugars, leaveners,
  chocolate → `baking`; broths, canned tomato products, coconut milk, cooking
  wine → `other`.
- **Fresh vs dried herbs:** herbs used predominantly fresh (`parsley`,
  `basil`, `thyme`, …) are `produce`; herbs sold predominantly dried
  (`oregano`, `bay leaf`) and the common dried duplicates (`dried thyme`,
  `dried basil`) are `spice`.
- **Lowercase singular**, with the plural retained only where the singular is
  not idiomatic (`collard greens`).
- One row per pantry item, variants folded into aliases (e.g. `pasta` carries
  `spaghetti;penne;macaroni;…`; `hot sauce` carries `tabasco;sriracha`).

### Provenance (drafted 2026-07-06)

Drafting procedure:

1. Took the union of the example foods named on the five **USDA MyPlate
   food-group pages** (Vegetables, Fruits, Grains, Protein Foods, Dairy).
2. Took the union with the **Food Network Kitchen** "A Complete Checklist of
   Pantry, Refrigerator and Freezer Essentials" for the categories MyPlate
   does not cover (cooking fats, vinegars, dried herbs/spices, condiments,
   baking).
3. Filtered to Western home-cooking staples (dropped rare gallery items such
   as game meats and amaranth leaves) and normalized per the curation rules
   above.
4. Added builder-curated staples appearing in neither source (e.g. turmeric,
   cardamom, oyster sauce, arborio rice) and the build plan's mandated
   coverage set: common high-risk proteins (chicken, ground beef, pork, eggs,
   fish/shellfish varieties), Big-9 allergen carriers (milk, butter, cheeses,
   eggs, wheat flour, soy sauce, peanut butter, tree nuts, sesame, shrimp, …),
   and the demo-relevant items (garlic, olive oil, carrot, parsley, yogurt,
   lemon).
5. Capped at the spec's ~150–250 range (246 rows).

Sources (all content verified 2026-07-06 by downloading and reading the dated
Internet Archive snapshots below; as of 2026-07-06 the live
`myplate.gov/eat-healthy/*` URLs redirect to the MyPlate homepage, and the
live foodnetwork.com / fsis.usda.gov pages return HTTP 403 to non-browser
clients, so the archived snapshots are the citable artifacts):

- USDA MyPlate — Vegetables:
  <https://web.archive.org/web/20240605185228/https://www.myplate.gov/eat-healthy/vegetables>
  (snapshot 2024-06-05)
- USDA MyPlate — Fruits:
  <https://web.archive.org/web/20230525170342/https://www.myplate.gov/eat-healthy/fruits>
  (snapshot 2023-05-25)
- USDA MyPlate — Grains:
  <https://web.archive.org/web/20250102121947/https://www.myplate.gov/eat-healthy/grains>
  (snapshot 2025-01-02)
- USDA MyPlate — Protein Foods:
  <https://web.archive.org/web/20241229113135/https://www.myplate.gov/eat-healthy/protein-foods>
  (snapshot 2024-12-29)
- USDA MyPlate — Dairy:
  <https://web.archive.org/web/20241230195543/https://www.myplate.gov/eat-healthy/dairy>
  (snapshot 2024-12-30)
- Food Network Kitchen — "A Complete Checklist of Pantry, Refrigerator and
  Freezer Essentials":
  <https://web.archive.org/web/20250411052718/https://www.foodnetwork.com/recipes/packages/cooking-from-the-pantry/pantry-essentials-checklist>
  (snapshot 2025-04-11)
- USDA FSIS — "Food Allergies: The 'Big 9'" (names the nine allergen classes
  used by the `big9_flags` enum):
  <https://web.archive.org/web/20250528000124/https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/food-allergies-big-9>
  (snapshot 2025-05-28)

Limitations: this file is a **curated vocabulary**, not measured data — the
membership and alias/category assignments are editorial (steps 3–4 above), and
per-row factual provenance lives with each downstream asset (nutrition →
`usda/PROVENANCE.md`, allergens → `foodon/PROVENANCE.md`, prices →
`cost/prices.csv` source column). User spot-review happens at Gate A.

## aliases.csv — curated alias table for the grounding resolver

Flat `alias,canonical` table read by `internal/grounding/resolve.go` (task
2.7): the resolver normalizes an incoming ingredient name (lowercase,
non-alphanumerics → space, naive-singularize, then qualifier-stripping as a
second pass) and looks it up first among canonical universe names, then in
this table. Seeded 2026-07-07 from the `aliases` column of `ingredients.csv`
(one row per alias, same editorial provenance as above) plus four
builder-curated common variants: `garbanzo` → chickpea, `whipping cream` →
heavy cream, `table sugar` → granulated sugar, `coriander leaves` → cilantro.
Rows whose normalized alias equals a canonical universe name are omitted
(canonical lookup already wins), and every `canonical` value must be an
`ingredients.csv` name. Plural forms are still NOT listed — normalization
handles them. Sorted by alias; keep it that way when editing.
