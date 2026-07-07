# data/usda/ — provenance

Vendored USDA FoodData Central subset for the CapyCook ingredient universe
(`data/ingredients.csv`). Produced by `scripts/vendor_usda.py` (re-runnable;
stdlib-only Python 3.9+), which downloads the pinned raw releases below into a
scratch directory, verifies their SHA256, and writes only the universe-bounded
subset into this directory. Raw bulk zips are never committed.

## Pinned raw artifacts

Download URLs verified live on <https://fdc.nal.usda.gov/download-datasets/>
on 2026-07-06; SHA256 computed from the artifacts downloaded that day. The
script refuses to run against a zip whose hash differs from these pins.

| dataset | page label / release | URL | size (bytes) | SHA256 |
|---|---|---|---|---|
| Foundation Foods CSV | April 2026 (file: 2026-04-30) | <https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip> | 3,825,517 | `d6d4f41dcd19a46abcdd67775379cb6f0292ff08daa7e0680fdd0982830bf57b` |
| SR Legacy CSV | April 2018 (file: 2018-04) | <https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip> | 6,074,592 | `b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0` |

SR Legacy is the final release of the National Nutrient Database for Standard
Reference (SR28, April 2018) and is no longer updated; it serves as the
fallback/completeness source beside the current Foundation Foods release.

## Files

### nutrients.csv — per-100g panel nutrients (243 rows, 2026-07-06 run)

One row per matched universe ingredient: `name, fdc_id, source_dataset,
usda_description`, then the eight panel fields **per 100 g edible portion**:
`calories_kcal, protein_g, fat_g, sat_fat_g, carbs_g, fiber_g, sugar_g,
sodium_mg`. A blank cell means USDA published no value for that nutrient on
that food — blanks stay blank (rendered `[unverified]` downstream), never
imputed. 216 of 243 rows carry a complete panel. FDC nutrient ids used, in
preference order per field: energy 1008 → 2047 → 2048 (kcal); protein 1003;
total fat 1004; saturated fat 1258; carbohydrate 1005; fiber 1079; total
sugars 2000 → 1063; sodium 1093.

### portions.csv — FDC foodPortion gram weights (714 rows, 2026-07-06 run)

`name, fdc_id, source_dataset, amount, unit, portion_description,
gram_weight`: household-measure gram weights straight from each dataset's
`food_portion.csv` (units resolved via `measure_unit.csv`; SR Legacy free-text
modifiers reduced to their first measure token, full text preserved in
`portion_description`). A portion measured in the food's own noun ("1 egg =
50.3 g") is normalized to unit `whole`. Grams for one `unit` =
`gram_weight / amount`.

**Portion fallback:** when a Foundation-matched food has no foodPortion rows,
the script vendors the portions of the SR Legacy food matched to the same
universe name (procedure in the script header); those rows carry the SR
`fdc_id`, so the substitution is auditable per row.

## Matching (universe name → FDC food)

Deterministic two-tier procedure, fully documented in the header and
`FDC_OVERRIDES` map of `scripts/vendor_usda.py`:

1. **Curated override** (~190 names): hand-picked from the downloaded
   `food.csv` rows on 2026-07-06 under written rules — as-purchased retail
   form; fullest panel coverage; ties prefer Foundation Foods. Every pick's
   USDA description is in the `usda_description` column for spot-review.
2. **Normalized exact match** (remaining names): lowercase/singularized
   equality against the description (optionally minus a trailing ", raw"),
   accepted only when unique within a dataset; fuller-panel dataset wins.

Documented closest-equivalent substitutions (visible per row): dijon mustard →
prepared yellow mustard; white wine vinegar → red wine vinegar; rice vinegar →
distilled vinegar; smoked paprika → paprika; red pepper flake → red/cayenne
pepper; cherry tomato → grape tomatoes.

Deliberately unmatched (no USDA food exists; rendered `[unverified]`):
`sage` (fresh; only ground sage exists), `italian seasoning`,
`cajun seasoning` (blends with no USDA entry).

## License

USDA FoodData Central states (homepage, <https://fdc.nal.usda.gov/>, verified
2026-07-06): "USDA FoodData Central data are in the public domain and they are
not copyrighted. They are published under CC0 1.0 Universal (CC0 1.0)."

Suggested citation (same page): U.S. Department of Agriculture, Agricultural
Research Service, Beltsville Human Nutrition Research Center. FoodData
Central. [Internet]. Available from <https://fdc.nal.usda.gov/>.
