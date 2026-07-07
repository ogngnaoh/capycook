# data/foodon/ — provenance

FoodOn-derived FDA **Big-9 allergen closure** for the CapyCook ingredient
universe (`data/ingredients.csv`). Produced by `scripts/vendor_foodon.py`
(re-runnable; stdlib-only Python 3.9+), which downloads the pinned FoodOn OWL
release into a scratch directory, verifies its SHA256, maps each universe
ingredient to a FoodOn class, computes the transitive closure up FoodOn's
`is_a` + composition hierarchy to nine allergen anchor groups, and writes only
the universe-bounded table below. The raw ~42 MB OWL is never committed.

The Go allergen service (`internal/services/allergen.go`) reads only
`allergens.csv`. It is **fail-closed**: with allergens declared, an ingredient
absent from this table blocks with "allergen status unknown for X".

## Pinned raw artifact

Download URL, release tag, and SHA256 verified against the GitHub release on
2026-07-06. The file's internal `owl:versionIRI` is
`http://purl.obolibrary.org/obo/foodon/releases/2025-01-29/foodon.owl`. The
script refuses to run against an OWL whose hash differs from this pin.

| item | value |
|---|---|
| ontology | FoodOn Food Ontology |
| release tag | `v2025-01-29` |
| asset | `foodon.owl` (RDF/XML) |
| URL | <https://github.com/FoodOntology/foodon/releases/download/v2025-01-29/foodon.owl> |
| size (bytes) | 41,567,810 |
| SHA256 | `c9a232096f4cc794825a96ccff4b061946ac7234bec4a70e350299f3d0d7ec14` |

Only the OWL asset ships on the FoodOn releases (no `.obo` / `-base.owl`); the
OBO PURL (`purl.obolibrary.org/obo/foodon.obo`) redirects to a stale
`foodon_old.obo` on `master` and is **not** a pinned release, so the OWL is the
authoritative pin. It is parsed with `xml.etree.ElementTree` (stdlib) — no
rdflib, no venv.

## File

### allergens.csv — Big-9 closure table (246 rows, 2026-07-06 run)

One row per universe ingredient: `name, foodon_id, big9, mapping_method`.
`big9` is a semicolon-separated subset of the FDA Big-9 in canonical order
(milk; eggs; fish; crustacean shellfish; tree nuts; peanuts; wheat; soybeans;
sesame); empty means no Big-9 allergen. 61 of 246 rows carry an allergen.
`foodon_id` is the mapped FoodOn class (blank when no class matched — the
allergen, if any, then comes from curation). `mapping_method` records how the
row was derived (see below). The universe CSV's `big9_flags` column mirrors
this table (allergens.csv is the source of truth).

## Closure model (allergen carry-over)

FoodOn is an `is_a` taxonomy plus object-property axioms. Allergen identity is
carried **upward** from an ingredient class along four relations:

| relation | id | example |
|---|---|---|
| subClassOf (is_a) | — | cheddar cheese *is a* cheese |
| derives from | RO:0001000 | butter *derives from* cow milk |
| has defining ingredient | FOODON:00001563 | cheese *has defining ingredient* milk curd |
| has ingredient | FOODON:00002420 | mayonnaise-type products *have ingredient* … |

The task specifies "is_a / derives-from"; the two composition relations are
included as well because an allergen carries through **composition**, not only
genus (cheese is a milk allergen via its defining ingredient). Traversing more
relations can only **add** detections, never remove them — the safe direction
for a fail-closed gate. For each mapped class we take the reflexive-transitive
closure over these relations and test membership of the nine anchor groups.

## Allergen anchor classes (which FoodOn classes anchor each of the 9)

Every anchor id below was confirmed present in the pinned release, and each
carrier's closure was checked to reach the intended anchor. A group fires when
the closure reaches **any** id in it (FoodOn routes some foods through its
food-product hierarchy and others through organism taxonomy — both are
covered).

| Big-9 | anchor class ids and labels |
|---|---|
| milk | `FOODON:00001257` milk or milk based food product · `FOODON:00001256` dairy food product · `UBERON:0001913` milk |
| eggs | `FOODON:00001274` egg food product |
| fish | `FOODON:03411222` fish · `NCBITaxon:7898` Actinopterygii (ray-finned fishes) |
| crustacean shellfish | `FOODON:03411374` crustacean · `NCBITaxon:6657` Crustacea |
| tree nuts | `FOODON:00001172` nut food product *(minus peanut — see rule)* |
| peanuts | `FOODON:00002099` peanut food product · `NCBITaxon:3818` Arachis hypogaea |
| wheat | `FOODON:03411312` wheat plant · `NCBITaxon:4564` Triticum |
| soybeans | `FOODON:03301415` soybean · `NCBITaxon:3847` Glycine max |
| sesame | `FOODON:03310306` sesame seed · `NCBITaxon:4182` Sesamum indicum |

**Molluscs are intentionally excluded.** Clams, mussels, scallops, and oyster
sauce carry no Big-9 flag: molluscan shellfish is *not* among the US FDA Big-9
(that list is milk, egg, fish, Crustacean shellfish, tree nuts, peanuts, wheat,
soybeans, sesame — sesame added by the FASTER Act, effective 2023).

**Peanut / tree-nut rule.** FoodOn files "peanut (whole or pieces)" under "nut
food product", but the FDA separates peanut (a legume) from tree nuts. When a
class reaches **both** the nut-food-product anchor and a peanut anchor it is
classified peanuts-only, never tree nuts. Coconut, which FoodOn also files
under "nut food product", is intentionally retained as a tree nut to match FDA
labelling (coconut oil / coconut milk → tree nuts).

## Ingredient → FoodOn class mapping (deterministic)

1. **Curated override** (tier 0, `mapping_method = curated_class`): a hand-
   picked class id used where the auto-match is absent or maps to a wrong
   identity. Every id was looked up in the pinned release and its closure
   checked to reach the intended anchor. Full list:
   cheddar → cheddar cheese (`FOODON:03302458`); mozzarella → mozzarella cheese
   (`FOODON:03303578`); parmesan → parmesan cheese food product
   (`FOODON:00003247`); feta → feta cheese (`FOODON:03307280`); ricotta →
   ricotta cheese (`FOODON:03302908`); goat cheese → goat milk cheese
   (`FOODON:03303655`); buttermilk → mammalian buttermilk (`FOODON:00002398`);
   yogurt → yogurt food product (`FOODON:00001014`); egg → chicken egg
   (`FOODON:03316061`); canned tuna → tuna (`FOODON:03411269`); all-purpose
   flour → white wheat flour (`FOODON:03302339`); couscous → couscous (dried)
   (`FOODON:03303207`); flour tortilla → tortilla (`FOODON:03307668`); jalapeno
   → jalapeno pepper (`FOODON:00003494`); zucchini → zucchini food product
   (`FOODON:00002448`).
2. **Normalized exact match** (`label_match`): the canonical name, normalized
   (lowercase, non-alphanumerics → space, naive-singularize each token — the
   same rule as `vendor_usda.py` and the Go resolver), matched against FoodOn
   `rdfs:label` then `oboInOwl:hasExactSynonym`. Deterministic pick among
   candidates: FoodOn ids over external-ontology ids; then "… food product"
   labels; then shortest label; then smallest id.
3. **Alias match** (`alias_match`): the same match run over each alias in
   `ingredients.csv` when the canonical name does not match.
4. **Unmapped** (`unmapped`): no FoodOn class matched. 26 ingredients are
   unmapped; 23 of them carry no Big-9 allergen (spices, vinegars, sugars,
   plain meats, corn/rice products, dried fruit — verified by category). The
   remaining 3 receive a curated allergen (below) with a blank `foodon_id`.

## Curated Big-9 additions (composition / labelling)

FoodOn models these as generic condiments, sauces, or breads with no
ingredient-level allergen axiom, so the closure alone finds nothing. Big-9
status is added from recipe composition + FDA labelling norms (union-only with
the closure; `mapping_method` gains a `+curated_allergen` suffix). Each is a
safety-conservative call, documented here for Gate A:

| ingredient | added | basis |
|---|---|---|
| mayonnaise | eggs | emulsion of egg yolk |
| tahini | sesame | ground sesame seed |
| sesame oil | sesame | pressed from sesame seed; unrefined toasted oil retains protein |
| soy sauce | soybeans, wheat | brewed from soybeans + wheat (shoyu); tamari (wheat-free) is the exception |
| fish sauce | fish | fermented anchovy extract |
| worcestershire sauce | fish | contains anchovies |
| pesto | milk, tree nuts | basil pesto: parmesan + pine nuts/walnuts |
| bread | wheat | wheat-based staple (Western default) |
| breadcrumb | wheat | made from wheat bread |
| cracker | wheat | wheat-based (saltine) |
| flour tortilla | wheat | wheat-flour flatbread |
| farro | wheat | farro is a hulled wheat (Triticum) |

Refined oils note: `vegetable oil` (incl. its soybean-oil alias) is left with
no Big-9 flag, matching the FDA exemption for highly refined oils; unrefined
nut/seed oils (`sesame oil`, `peanut oil`, `coconut oil`) are flagged.

## License

FoodOn is released under **Creative Commons Attribution 4.0 International
(CC BY 4.0)** — declared in the OWL header
(`dcterms:license = https://creativecommons.org/licenses/by/4.0/`) and on
<https://foodon.org>.

Attribution / suggested citation: Dooley DM, Griffiths EJ, Gosal GS, et al.
*FoodOn: a harmonized food ontology to increase global food traceability,
quality control and data integration.* npj Science of Food 2, 23 (2018).
Ontology homepage: <https://foodon.org>; source:
<https://github.com/FoodOntology/foodon>.
