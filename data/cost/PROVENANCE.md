# data/cost/ — provenance

Retail price table for the CapyCook ingredient universe
(`data/ingredients.csv`), consumed by the cost service
(`internal/services/cost.go`). This table is **[approximate] by design** and
is **NOT USDA-nutrition-attributed** (DESIGN.md tier split: nutrition is the
authoritative tier, cost is the approximate tier). Every ingredient's cost in
the UI carries the `[approximate]` marker; an unpriceable ingredient is
excluded from totals and footnoted — never counted as $0.

Produced by `scripts/vendor_cost.py` (re-runnable; stdlib-only Python 3.9+),
which downloads the raw price files below into a scratch directory (never
committed), extracts the official rows, and preserves the hand-authored
estimate rows. Assembled 2026-07-07.

## prices.csv — schema

One row per universe ingredient (246 rows), universe order:

| column | meaning |
|---|---|
| `name` | canonical universe name (join key to `data/ingredients.csv` and `data/usda/portions.csv`) |
| `usd_per_unit` | USD price at `unit_basis`, 4 decimals |
| `unit_basis` | `per_100g` (per 100 g as purchased) or `per_unit` (per whole item — only `egg`) |
| `source` | per-row source: the exact BLS series id + label + observed price, the exact ERS item + form + price, or the uniform estimate tag |
| `as_of` | observation period of the price: BLS observation month (`2026-05`), ERS scanner-data year (`2023`), or estimation month (`2026-07`) |

## Two-tier sourcing procedure (sanctioned split, for Gate A review)

**Tier A — official series (80 rows).** An ingredient covered by a live
official price series gets that series as its per-row source:

1. **BLS Average Price Data (30 rows)** — U.S. Bureau of Labor Statistics AP
   program, U.S. city average, monthly. The latest monthly observation in the
   downloaded snapshot (2026-05 for every series used) is recorded verbatim
   in the source cell. Series older than 2025 are treated as discontinued
   and deliberately NOT used (see below). BLS wins over ERS when both cover
   an ingredient (fresher data).
2. **USDA ERS Fruit and Vegetable Prices (50 rows)** — Economic Research
   Service estimates of average retail prices from **2023 Circana OmniMarket
   Core Outlets scanner data** (combined CSVs, release updated 2025-12-09).
   All rows used are priced per pound (asserted by the script). Vintage
   cross-checked: the combined-CSV banana price equals the 2023 figure in
   ERS's per-commodity workbook (`bananas-average-retail-price-...xlsx`) to
   full precision, and that workbook's source note names the 2023 Circana
   data. Per ERS's disclaimer: the findings in that data product should not
   be attributed to Circana.

**Tier B — uniform estimation basis (166 rows).** Ingredients in neither
live series carry the uniform source tag `estimate: typical US
conventional-supermarket shelf price, builder judgment (tier B; ...)`.
Basis: the builder's (Claude, 2026-07) judgment of a typical US conventional
supermarket's shelf price for the as-purchased retail form, converted to USD
per 100 g from a typical package size and price, sanity-anchored against
neighbouring tier-A items (e.g. `red onion` against the ERS onion series).
These are **NOT measurements or citations** — expect roughly ±50% variance
by region, brand, and package size. They exist so every universe ingredient
has an order-of-magnitude price; the per-row `source` tag keeps them
distinguishable from cited figures. User spot-review happens at Gate A.

## Raw artifacts (2026-07-07 snapshot)

Downloaded by the script with an identifying User-Agent; SHA256 computed from
the artifacts as downloaded. Both programs publish **rolling** files (BLS
appends monthly; ERS re-releases), so these pins are advisory: the script
warns loudly on mismatch instead of aborting — a changed hash means new
upstream data, which must be re-reviewed and re-pinned here.

| artifact | URL | size (bytes) | SHA256 |
|---|---|---|---|
| BLS AP current data | <https://download.bls.gov/pub/time.series/ap/ap.data.0.Current> | 8,906,314 | `9122d018f1af426680939ec7e027acf18bb8299a5a9ca3b3c32527fe895e7d8f` |
| BLS AP item list | <https://download.bls.gov/pub/time.series/ap/ap.item> | 9,242 | `4e96f3bca741f65692971fdec8053a44f7ee20f47a02eace4c4d3d9a1dd148f6` |
| BLS AP readme | <https://download.bls.gov/pub/time.series/ap/ap.txt> | 10,417 | `c83886f9a54f113a093c4251d5893233854407e382ae0d5209ffb09f791e7864` |
| ERS all fruits (CSV) | <https://www.ers.usda.gov/media/6210/all-fruits-average-prices-csv-format.csv?v=22396> | 5,097 | `b7fc0b4a9c11d7ff1599959297da3c175efdbb6bb7e543e5493f4acc06f0d45d` |
| ERS all vegetables (CSV) | <https://www.ers.usda.gov/media/6240/all-vegetables-average-prices-csv-format.csv?v=55841> | 7,230 | `7228c4bccd6a60c6e383aff930a2c76e8daca045eda61945e484e632b26aa406` |

ERS landing page (lists both CSVs and the per-commodity workbooks):
<https://www.ers.usda.gov/data-products/fruit-and-vegetable-prices>.

## Unit conversions (exact, applied by the script)

- **per lb → per 100 g:** divide by 4.5359237 (1 lb = 453.59237 g exactly).
- **per N oz → per 100 g:** divide by N × 0.28349523125 (yogurt: 8 oz;
  strawberries: 12 oz — the BLS series' own basis).
- **eggs per dozen → per_unit:** divide by 12. The cost service recovers a
  unit count from gram quantities via the vendored USDA portion
  `egg: 1 whole = 50.3 g`.
- **per gallon / per liter → per 100 g:** a density is never assumed —
  grams come from the food's own vendored USDA portion row
  (`data/usda/portions.csv`): milk `1 cup = 244 g`
  (⇒ 1.0313 g/ml, $4.217/gal ⇒ $0.1080/100 g); wine `1 fl oz = 29.4 g`
  (⇒ 0.9941 g/ml, $13.841/L ⇒ $1.3923/100 g).

## Closest-match substitutions (visible per row in the source cell)

No row carries an invented source; where the exact universe item has no
official series, either the named closest series is used (listed here) or
the row is an explicit tier-B estimate:

- `cannellini bean` → BLS "Beans, dried, any type, all sizes" (no
  cannellini-specific series anywhere; ERS covers black/kidney/navy/pinto
  individually, which those rows use).
- `beef steak` → BLS "All Uncooked Beef Steaks"; `pork chop` → "All Pork
  Chops"; `ham` → "All Ham (Excluding Canned Ham and Luncheon Slices)".
- `bell pepper` → ERS "Green peppers"; `cabbage` → "Cabbage, green";
  `carrot` → "Carrots, raw whole"; `cauliflower` → "Cauliflower heads";
  `broccoli` → "Broccoli heads"; `celery` → "Celery, trimmed bunches";
  `mushroom` → "Mushrooms, whole"; `spinach` → "Spinach, eaten raw";
  `cucumber` → "Cucumbers with peel"; `cherry tomato` → "Tomatoes, grape
  and cherry"; `raisin` → "Grapes (raisins)".
- Non-fresh purchase forms, named in the source cell: `green pea` → Frozen;
  `pumpkin`, `beet`, `olive`, `canned tomato` → Canned; `lentil`,
  `dried apricot`, `dried cranberry`, `date` → Dried.
- `white wine` and `red wine` share BLS "Wine, red and white table" (one
  combined series).

**Discontinued BLS series deliberately not used** (a stale price presented
as current would mislead; the ingredients are ERS or tier B instead):
canned tuna 707111 (last 2017-09), apples Red Delicious 711111 (2017-10,
apple uses ERS 2023), peanut butter 716141 (2017-12), butter grade AA
710111 (2012-04, butter uses the live FS1101), cucumbers 712409 (2000-04,
uses ERS), canned tomatoes 714232 (1997-12, uses ERS), sweet peppers
712406 / broccoli 712412 (latest values withheld, use ERS).

## Known limitations

- Prices are national averages of the **as-purchased retail form**; a draft
  that lists a prepared quantity (e.g. grams of cooked rice or beans) is
  costed at the dry/raw retail price for that gram mass — a documented
  approximation, not a claim.
- Spice rows look expensive per 100 g because retail spice jars are small
  (30–60 g); that is the real shelf economics, not an error.
- Tier B rows are judgment estimates (basis above), not observations.

## License

BLS states that everything it publishes is in the public domain ("Copyright
Information", <https://www.bls.gov/opub/copyright-information.htm>; the live
page returns HTTP 403 to non-browser clients, verified via the 2026-07-03
Internet Archive snapshot
<https://web.archive.org/web/20260703122714/https://www.bls.gov/opub/copyright-information.htm>).
USDA ERS data products are likewise U.S. government work; ERS asks that
findings not be attributed to Circana, whose scanner data underlies the
estimates.
