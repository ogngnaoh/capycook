# data/safety/ — provenance

Deterministic safety-gate rule data for the CapyCook ingredient universe
(`data/ingredients.csv`), consumed by the safety gate
(`internal/services/safety.go`, task 2.6). Three tables, all hand-authored from
primary public-health sources with a per-row citation, plus the ingredient →
protein-class map the cook-temperature rule keys on. Reviewed by the user at
Gate A. Assembled 2026-07-07.

The gate is **deterministic, structured, and fail-closed** (SPEC §6, DESIGN
locked decision #3 — hard-block only in v0). It reads the `technique` enum and
`internal_temp_c` field of each `draft.Step`, never prose keywords in the
recipe text (the one exception is the low-acid-aromatic pattern the
`infuse_oil` rule requires — a structured `technique==infuse_oil` gate first,
then a name/text pattern). "Deterministic and conservative beats clever":
where a rule is deliberately narrow or deliberately broad, that calibration is
stated here rather than papered over with heuristics.

## Source-verification note (Gate A honesty)

Every URL below was checked on 2026-07-07 with the automated fetcher.

- **CDC botulism pages fetch cleanly** and their exact wording is quoted below —
  these are the load-bearing citations for `anaerobic_lexicon.csv`.
- **`fsis.usda.gov` returns HTTP 403 to non-browser clients** (the whole domain
  blocks automated fetches — the same behaviour the cost table documents for
  `bls.gov`, see `data/cost/PROVENANCE.md`). The FSIS Safe Minimum Internal
  Temperature Chart values were therefore verified by web search surfacing
  FSIS's own hosted text across three independent queries on 2026-07-07, all
  returning identical figures (poultry 165 F; ground meat 160 F; beef/pork/
  veal/lamb steaks/chops/roasts 145 F + 3-minute rest; fish & shellfish 145 F;
  egg dishes 160 F; leftovers/casseroles 165 F). These are also among the most
  stable, widely-republished public-health figures in existence. No value here
  is invented; the canonical chart URL is cited per row as the authoritative
  source even though it 403s to this fetcher.

FSIS publishes in **degrees Fahrenheit**. The `min_internal_temp_c` column is
the standard rounded Celsius conversion (165 F = 73.9 C → **74 C**; 160 F =
71.1 C → **71 C**; 145 F = 62.8 C → **63 C**) — the same roundings used
internationally and named in this milestone's task. The `min_internal_temp_f`
column preserves the source figure. The gate compares in Celsius because
`draft.Step.internal_temp_c` is Celsius.

## min_temps.csv — FSIS minimum internal cooking temperatures

One row per **high-risk protein class**. Columns:

| column | meaning |
|---|---|
| `protein_class` | class key, joined from `protein_classes.csv` |
| `min_internal_temp_c` | FSIS minimum internal temperature, rounded Celsius (the value the gate compares) |
| `min_internal_temp_f` | the source FSIS figure, degrees Fahrenheit |
| `rest_time_min` | required post-cook rest before eating, minutes (whole cuts = 3; else 0) |
| `fsis_citation` | the FSIS Safe Minimum Internal Temperature Chart URL |
| `notes` | scope + the exact FSIS wording basis, incl. the C↔F rounding |

Source (authoritative; 403s to the fetcher — see note above):
**USDA FSIS, "Safe Minimum Internal Temperature Chart"**,
<https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/safe-temperature-chart>.
Cross-referenced: FSIS "Doneness Versus Safety" and the FSIS Ask article
"What is a safe internal temperature for cooking meat and poultry?"
(same figures).

## anaerobic_lexicon.csv — Clostridium botulinum technique rules

One row per anaerobic-preservation technique the gate hard-blocks. Columns:

| column | meaning |
|---|---|
| `rule_id` | stable id cited in the block reason |
| `technique` | the `draft.Step.technique` enum value the rule fires on |
| `block_condition` | how the rule fires (below) |
| `text_patterns` | `;`-separated lowercase substrings, matched against step text + ingredient names (only for `on_pattern`) |
| `reason` | human-readable block reason |
| `citation` | primary source URL |

`block_condition` semantics (evaluated in Go, keyed by this column):

- **`always`** — the technique alone blocks (`can`, `ferment`, `cure`). These
  are anaerobic low-acid preservation methods whose safe execution needs
  validated processes outside v0's scope.
- **`on_pattern`** — the technique blocks only when a `text_patterns` substring
  appears in the step text or any ingredient name (`infuse_oil` + a fresh
  low-acid aromatic: garlic, herbs, ginger, chili, alliums, sun-dried tomato).
  A structured `technique==infuse_oil` gate precedes the pattern match.
- **`missing_temp_control`** — the technique blocks when the step states **no**
  `internal_temp_c` (`sous_vide`). A sous-vide step *with* a stated temperature
  does not trip this anaerobic rule; but note sous-vide is **not** in the
  cook-temp rule's satisfying-technique set (below), so sous-vide of a
  high-risk protein still hard-blocks in v0 — validated sous-vide
  pasteurization of raw proteins is expert territory, deliberately out of scope.

### Citations (verified 2026-07-07, all fetch cleanly)

- **CDC, "Home-Canned Foods | Botulism"** (last reviewed Apr. 25, 2024),
  <https://www.cdc.gov/botulism/prevention/home-canned-foods.html>. Quoted:
  *"Refrigerate homemade oils made using garlic or herbs. Throw away any unused
  oils made with garlic or herbs after 4 days."* and *"Pressure canning is the
  only recommended method for canning low-acid foods."* and *"Low-acid foods
  have a pH higher than 4.6. These foods include all fresh vegetables, figs,
  meats, poultry, fish, seafood, and some tomatoes."*
- **CDC, "Botulism Prevention"** (last reviewed Feb. 26, 2026),
  <https://www.cdc.gov/botulism/prevention/index.html>. Quoted: *"Common
  sources of botulism are homemade foods that have been improperly canned,
  preserved, or fermented."* and *"New sources of botulism have been found.
  They include chopped garlic in oil, canned cheese sauce (such as nacho
  cheese), carrot juice, baked potatoes wrapped in foil."*
- Background on fermentation as an anaerobic route: **CDC, "Alaska Native
  Foods | Botulism"**,
  <https://www.cdc.gov/botulism/prevention/alaska-native-foods.html>.

**Conservative calibration, stated for Gate A.** `ferment` and `cure` block on
the technique alone. This is deliberately broad: a well-executed, acidified
ferment or a properly nitrited cure is safe, but validating that is out of v0's
deterministic reach, so v0 hard-blocks the technique and surfaces the reason
for the cook to override with human judgment (the gate runs on proposals AND
human edits; the caller chooses block vs. warn-and-confirm — orchestrator,
Phase 1). The **narrow** side is equally deliberate: the anaerobic rules fire
only on these five technique enums, never on produce or ordinary cooking.

## protein_classes.csv — ingredient → protein class (cook-temp rule)

Maps each universe protein-category ingredient to a `protein_class`. Rows with
class `none` are **not** subject to the cook-temperature rule and are listed
only to make the classification auditable. Columns: `name` (join key to
`data/ingredients.csv`), `protein_class` (a `min_temps.csv` key or `none`),
`basis` (why).

**Method.** Every ingredient in `data/ingredients.csv` with category `protein`
(54 rows) was classified by hand against the FSIS chart's product categories:
poultry → `poultry`; ground red meats and raw ground-meat sausage →
`ground_meat`; beef/pork/lamb whole cuts and roasts → `whole_cut`; finfish →
`fish`; crustaceans and molluscs → `shellfish`; shell egg → `eggs`. Plant
proteins (tofu, tempeh, legumes), nuts/seeds, pre-cooked shelf-stable
`canned tuna`, and cured/commercially-processed `ham`/`bacon` are `none`.
Non-protein categories (produce, dairy, grains, spices, fats, condiments) are
**not** listed and default to not-high-risk — this is what lets salads and
produce dishes pass; the raw-technique block only bites high-risk classes.

**Documented calibration and limitations.**

- `ham` and `bacon` → `none`: retail ham is cured and typically fully cooked,
  and bacon is cured pork fried to crisp; neither carries the fresh-meat
  internal-temp target in v0. A fresh (green, uncured) ham would be `whole_cut`
  (145 F + rest) but is off the current universe.
- `canned tuna` → `none`: already cooked and shelf-stable.
- `anchovy`/`sardine` → `fish`: usually salt-cured/canned in practice, but
  classed with finfish so any cooked preparation is held to 145 F.
- **Scope is the fixed universe.** An off-universe protein name in a draft
  (e.g. "duck breast") is not in this map and so is **not** caught by the
  cook-temp rule — a known v0 limitation. The allergen half of the gate
  fail-closes on unresolved ingredients (with allergens declared); the
  cook-temp half is scoped to the known protein universe because
  fail-closing on every unrecognized ingredient would block essentially every
  draft. Grounding/resolution (task 2.7) widens the recognized set later.

## Cook-temperature rule (how the gate uses these tables)

For every draft ingredient whose `protein_class` is high-risk, the gate
requires **at least one step** whose `technique` is a *satisfying cook*
(`saute`, `roast`, `boil`, `simmer`, `bake`, `grill`, `fry`) with a stated
`internal_temp_c` **≥ the class minimum**. If none exists — because no step is
hot enough, or no cooked step states a temperature at all, or the protein is
prepared raw — the ingredient blocks. **Missing temperature is itself a block
reason** (fail-closed): the prompt is required to elicit temperatures for
high-risk proteins (SPEC §6/§7), so absence is a defect, not a default-pass.
`sous_vide`, `cure`, `ferment`, `can`, `infuse_oil`, `raw`, and `other` are
**not** satisfying cooks.

**Draft-global check (schema-forced).** `draft.Step` carries no structural link
to `draft.Ingredient`, so the gate cannot attribute a temperature to a specific
protein. It therefore asks a draft-global question: *does the draft contain any
satisfying-cook step reaching this class's minimum?* A consequence is that one
hot step (e.g. a 200 C vegetable roast) is read as satisfying every protein in
the draft — a v0 false-negative accepted deliberately, because the alternative
(inventing an ingredient↔step mapping from prose) is exactly the "clever"
heuristic this gate avoids. The conservative direction still dominates in
practice: the common unsafe cases (a protein with **no** temperature stated
anywhere, or prepared raw) block, and the prompt is required to state
temperatures for high-risk proteins.

## License / attribution

USDA FSIS and CDC materials are U.S. Government works in the public domain.
Suggested attribution: USDA Food Safety and Inspection Service; U.S. Centers
for Disease Control and Prevention. No third-party licensed data is vendored
here (these tables are hand-authored from public-domain guidance), so no raw
artifact is downloaded and none is committed.
