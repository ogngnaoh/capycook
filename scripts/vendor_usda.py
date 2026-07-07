#!/usr/bin/env python3
"""Vendor the USDA FoodData Central subset for the CapyCook ingredient universe.

Downloads the two pinned FoodData Central bulk CSV releases (Foundation Foods
and SR Legacy), verifies their SHA256 against the pinned values, matches foods
to the canonical ingredient universe in ``data/ingredients.csv``, and writes
the committed subset:

  data/usda/nutrients.csv  — per-100g panel nutrients per matched ingredient
  data/usda/portions.csv   — FDC foodPortion gram weights per matched ingredient

Raw zips and their extraction stay in ``--workdir`` (a scratch directory) and
are NEVER committed; only the universe-bounded subset above lands in the repo.
Provenance (exact URLs, release labels, SHA256) is recorded in
``data/usda/PROVENANCE.md`` and enforced by this script's pinned hashes.

Dependencies: Python 3.9+ standard library only (argparse, csv, hashlib,
pathlib, re, sys, urllib.request, zipfile). No third-party packages.

Usage:
    python3 scripts/vendor_usda.py --workdir /path/to/scratch [--repo .]
    python3 scripts/vendor_usda.py --workdir ... --candidates   # curation aid
    python3 scripts/vendor_usda.py --workdir ... --report       # match report

Matching procedure (deterministic, documented for Gate A review)
----------------------------------------------------------------
For each universe row's canonical ``name`` (aliases are deliberately NOT used
for matching — alias handling belongs to the grounding resolver, task 2.7):

  Tier 0 — curated override: ``FDC_OVERRIDES[name]`` maps directly to an
      fdc_id picked by hand from the real downloaded data (see the curation
      rules on the map below). Overrides always win.
  Tier 1 — normalized exact match, run against BOTH datasets:
      normalize(description) == normalize(name), or
      normalize(description minus one trailing ", raw") == normalize(name),
      where normalize = lowercase, non-alphanumerics to spaces, collapse
      whitespace, naive-singularize each token. A dataset contributes a
      candidate only when its hit is UNIQUE within that dataset. When both
      datasets produce a candidate, the one whose panel-nutrient coverage
      (count of the 8 panel fields present in food_nutrient.csv) is fuller
      wins; ties prefer Foundation Foods (newer analyses).
  No match -> the ingredient is simply absent from the vendored subset; the
      Go nutrition service then renders its contribution ``[unverified]``
      (never guessed). Deliberately unmatched: ``sage`` (no fresh-sage food in
      either dataset), ``italian seasoning`` and ``cajun seasoning`` (blends
      with no USDA food entry).

Portion fallback: some Foundation Foods rows carry no foodPortion rows. When
the matched food has none, and the same tier-1 procedure run against SR Legacy
alone finds a food for the same name (or ``PORTION_OVERRIDES[name]`` names
one), that SR food's portions are vendored under the same universe name with
the SR fdc_id recorded on each row — the household gram weight then comes from
a different, named-and-cited food than the per-100g nutrients. This is a
documented approximation, auditable per row in portions.csv via fdc_id.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

# --- pinned releases -------------------------------------------------------
# URLs verified live on https://fdc.nal.usda.gov/download-datasets/ on
# 2026-07-06 (page labels: Foundation Foods CSV "April 2026", SR Legacy CSV
# "April 2018"). SHA256 computed from the artifacts downloaded that day.
RELEASES = {
    "foundation": {
        "url": "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip",
        "release": "April 2026 (2026-04-30)",
        "sha256": "d6d4f41dcd19a46abcdd67775379cb6f0292ff08daa7e0680fdd0982830bf57b",
        "dirname": "FoodData_Central_foundation_food_csv_2026-04-30",
        "data_type": "foundation_food",
    },
    "sr_legacy": {
        "url": "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
        "release": "April 2018 (2018-04)",
        "sha256": "b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0",
        "dirname": "FoodData_Central_sr_legacy_food_csv_2018-04",
        "data_type": "sr_legacy_food",
    },
}

# --- panel nutrients -------------------------------------------------------
# Output column -> FDC nutrient ids in preference order (first present wins).
# 1008 Energy KCAL; 2047/2048 Atwater General/Specific (Foundation Foods often
# publish only these); 2000 "Sugars, Total"; 1063 "Sugars, Total (NLEA)".
PANEL = [
    ("calories_kcal", [1008, 2047, 2048]),
    ("protein_g", [1003]),
    ("fat_g", [1004]),
    ("sat_fat_g", [1258]),
    ("carbs_g", [1005]),
    ("fiber_g", [1079]),
    ("sugar_g", [2000, 1063]),
    ("sodium_mg", [1093]),
]
NEEDED_NUTRIENT_IDS = {i for _, ids in PANEL for i in ids}

# --- curated overrides (tier 0) -------------------------------------------
# name -> fdc_id. Every id was picked by hand from the real downloaded
# food.csv rows during curation on 2026-07-06 (regenerate pick lists with
# --candidates). Curation rules, in order:
#   1. The row must be the item "as purchased" for a US pantry: raw for
#      produce/meat/seafood, dry/uncooked for grains-pasta-legumes, the
#      typical retail form otherwise (AP flour = enriched; butter = salted;
#      milk = whole 3.25%; canned goods as labeled). Lab-basis rows such as
#      "Beans, Dry, Red (0% moisture)" are never used.
#   2. Among qualifying rows, prefer the fullest panel-nutrient coverage
#      (many April-2026 Foundation entries publish only a partial panel;
#      SR Legacy rows are usually complete). Coverage was checked against
#      the downloaded food_nutrient.csv during curation.
#   3. Ties prefer Foundation Foods (newer analyses); identical-description
#      Foundation duplicates (re-sampling rounds) resolve to the row with
#      fuller coverage, then the higher (newer) fdc_id.
#   4. A few rows are documented closest-equivalents, visible per row via the
#      usda_description column in nutrients.csv: dijon mustard -> prepared
#      yellow mustard; white wine vinegar -> red wine vinegar; rice vinegar ->
#      distilled vinegar; smoked paprika -> paprika; red pepper flake ->
#      red/cayenne pepper; cherry tomato -> grape tomatoes.
FDC_OVERRIDES: dict[str, int] = {
    # produce — alliums, roots, nightshades
    "red onion": 790577,        # foundation: Onions, red, raw
    "scallion": 170005,         # sr: Onions, spring or scallions (includes tops and bulb), raw
    "leek": 169246,             # sr: Leeks, (bulb and lower leaf-portion), raw
    "ginger": 169231,           # sr: Ginger root, raw
    "bell pepper": 170108,      # sr: Peppers, sweet, red, raw
    "jalapeno": 168576,         # sr: Peppers, jalapeno, raw
    "tomato": 170457,           # sr: Tomatoes, red, ripe, raw, year round average
    "cherry tomato": 321360,    # foundation: Tomatoes, grape, raw (closest equivalent)
    "potato": 170026,           # sr: Potatoes, flesh and skin, raw
    "sweet potato": 168482,     # sr: Sweet potato, raw, unprepared
    "fennel": 169385,           # sr: Fennel, bulb, raw
    # produce — brassicas, greens, squash, misc vegetables
    "broccoli": 747447,         # foundation: Broccoli, raw (fuller of the two duplicate rows)
    "romaine lettuce": 169247,  # sr: Lettuce, cos or romaine, raw
    "lettuce": 169248,          # sr: Lettuce, iceberg (includes crisphead types), raw
    "swiss chard": 169991,      # sr: Chard, swiss, raw
    "collard greens": 170406,   # sr: Collards, raw
    "zucchini": 169291,         # sr: Squash, summer, zucchini, includes skin, raw
    "yellow squash": 168464,    # sr: Squash, summer, crookneck and straightneck, raw
    "butternut squash": 169295, # sr: Squash, winter, butternut, raw
    "cucumber": 168409,         # sr: Cucumber, with peel, raw
    "mushroom": 169251,         # sr: Mushrooms, white, raw
    "green bean": 169961,       # sr: Beans, snap, green, raw
    "corn": 169998,             # sr: Corn, sweet, yellow, raw
    "green pea": 170419,        # sr: Peas, green, raw
    "avocado": 171705,          # sr: Avocados, raw, all commercial varieties
    # produce — fresh herbs (sold fresh; dried duplicates under spices)
    "parsley": 170416,          # sr: Parsley, fresh
    "cilantro": 169997,         # sr: Coriander (cilantro) leaves, raw
    "basil": 172232,            # sr: Basil, fresh
    "mint": 173475,             # sr: Spearmint, fresh
    "dill": 172233,             # sr: Dill weed, fresh
    "thyme": 173470,            # sr: Thyme, fresh
    "rosemary": 173473,         # sr: Rosemary, fresh
    # produce — fruit
    "lemon": 167746,            # sr: Lemons, raw, without peel
    "orange": 169097,           # sr: Oranges, raw, all commercial varieties
    "apple": 171688,            # sr: Apples, raw, with skin
    "strawberry": 747448,       # foundation: Strawberries, raw (fullest duplicate)
    "blueberry": 171711,        # sr: Blueberries, raw
    "raspberry": 167755,        # sr: Raspberries, raw
    "grape": 174683,            # sr: Grapes, red or green (European type), raw
    "peach": 169928,            # sr: Peaches, yellow, raw
    "cherry": 171719,           # sr: Cherries, sweet, raw
    "cantaloupe": 169092,       # sr: Melons, cantaloupe, raw
    "pineapple": 169124,        # sr: Pineapple, raw, all varieties
    "kiwi": 168153,             # sr: Kiwifruit, green, raw
    "grapefruit": 174673,       # sr: Grapefruit, raw, pink and red, all areas
    "raisin": 168165,           # sr: Raisins, dark, seedless
    "dried cranberry": 171723,  # sr: Cranberries, dried, sweetened
    "date": 168191,             # sr: Dates, medjool
    "dried apricot": 173941,    # sr: Apricots, dried, sulfured, uncooked
    # protein — poultry, meat
    "chicken breast": 171077,   # sr: Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw
    "chicken thigh": 173627,    # sr: Chicken, broilers or fryers, dark meat, thigh, meat only, raw
    "whole chicken": 171447,    # sr: Chicken, broilers or fryers, meat and skin, raw
    "ground turkey": 171505,    # sr: Turkey, Ground, raw
    "turkey breast": 171098,    # sr: Turkey, whole, breast, meat only, raw
    "ground beef": 174036,      # sr: Beef, ground, 80% lean meat / 20% fat, raw
    "beef steak": 168726,       # sr: Beef, top sirloin, steak, lean and fat, 1/8" fat, all grades, raw
    "beef chuck roast": 2646174,  # foundation: Beef, chuck, roast, boneless, choice, raw
    "ground pork": 167902,      # sr: Pork, fresh, ground, raw
    "pork chop": 168238,        # sr: Pork, fresh, loin, center loin (chops), bone-in, lean and fat, raw
    "pork tenderloin": 168312,  # sr: Pork, fresh, loin, tenderloin, separable lean and fat, raw
    "pork shoulder": 167843,    # sr: Pork, fresh, shoulder, whole, separable lean and fat, raw
    "ham": 173864,              # sr: Ham, sliced, regular (approximately 11% fat)
    "bacon": 168277,            # sr: Pork, cured, bacon, unprepared
    "italian sausage": 171631,  # sr: Sausage, Italian, pork, mild, raw
    "lamb": 174370,             # sr: Lamb, ground, raw
    # protein — seafood
    "salmon": 175167,           # sr: Fish, salmon, Atlantic, farmed, raw
    "cod": 171955,              # sr: Fish, cod, Atlantic, raw
    "tilapia": 175176,          # sr: Fish, tilapia, raw
    "trout": 173717,            # sr: Fish, trout, rainbow, farmed, raw
    "halibut": 174200,          # sr: Fish, halibut, Atlantic and Pacific, raw
    "canned tuna": 173709,      # sr: Fish, tuna, light, canned in water, drained solids
    "anchovy": 174183,          # sr: Fish, anchovy, european, canned in oil, drained solids
    "sardine": 175139,          # sr: Fish, sardine, Atlantic, canned in oil, drained solids with bone
    "shrimp": 175179,           # sr: Crustaceans, shrimp, raw
    "scallop": 174220,          # sr: Mollusks, scallop, mixed species, raw
    "mussel": 174216,           # sr: Mollusks, mussel, blue, raw
    "clam": 174214,             # sr: Mollusks, clam, mixed species, raw
    "crab": 174204,             # sr: Crustaceans, crab, blue, raw
    # protein — eggs, soy, legumes
    "egg": 748967,              # foundation: Eggs, Grade A, Large, egg whole (full panel)
    "tofu": 172475,             # sr: Tofu, raw, firm, prepared with calcium sulfate
    "edamame": 168410,          # sr: Edamame, frozen, unprepared (as purchased)
    "black bean": 173734,       # sr: Beans, black, mature seeds, raw
    "kidney bean": 175193,      # sr: Beans, kidney, all types, mature seeds, raw
    "pinto bean": 175199,       # sr: Beans, pinto, mature seeds, raw
    "cannellini bean": 2644281, # foundation: Beans, cannellini, dry (no SR equivalent)
    "navy bean": 173745,        # sr: Beans, navy, mature seeds, raw
    "chickpea": 173756,         # sr: Chickpeas (garbanzo beans, bengal gram), mature seeds, raw
    "split pea": 172428,        # sr: Peas, green, split, mature seeds, raw
    # protein — nuts and seeds
    "almond": 170567,           # sr: Nuts, almonds
    "walnut": 170187,           # sr: Nuts, walnuts, english
    "pecan": 170182,            # sr: Nuts, pecans
    "cashew": 170162,           # sr: Nuts, cashew nuts, raw
    "pistachio": 170184,        # sr: Nuts, pistachio nuts, raw
    "hazelnut": 170581,         # sr: Nuts, hazelnuts or filberts
    "peanut": 172430,           # sr: Peanuts, all types, raw
    "pine nut": 170591,         # sr: Nuts, pine nuts, dried
    "sunflower seed": 170562,   # sr: Seeds, sunflower seed kernels, dried
    "pumpkin seed": 170556,     # sr: Seeds, pumpkin and squash seed kernels, dried
    "sesame seed": 170150,      # sr: Seeds, sesame seeds, whole, dried
    "chia seed": 170554,        # sr: Seeds, chia seeds, dried
    "flax seed": 169414,        # sr: Seeds, flaxseed
    # dairy
    "milk": 171265,             # sr: Milk, whole, 3.25% milkfat, with added vitamin D
    "buttermilk": 170874,       # sr: Milk, buttermilk, fluid, cultured, lowfat
    "heavy cream": 170859,      # sr: Cream, fluid, heavy whipping
    "sour cream": 171257,       # sr: Cream, sour, cultured
    "cream cheese": 173418,     # sr: Cheese, cream
    "butter": 173410,           # sr: Butter, salted
    "yogurt": 171284,           # sr: Yogurt, plain, whole milk
    "greek yogurt": 171304,     # sr: Yogurt, Greek, plain, whole milk
    "cheddar": 173414,          # sr: Cheese, cheddar
    "mozzarella": 170845,       # sr: Cheese, mozzarella, whole milk
    "parmesan": 171247,         # sr: Cheese, parmesan, grated
    "feta": 173420,             # sr: Cheese, feta
    "goat cheese": 173435,      # sr: Cheese, goat, soft type
    "ricotta": 170851,          # sr: Cheese, ricotta, whole milk
    "cottage cheese": 172179,   # sr: Cheese, cottage, creamed, large or small curd
    # grains
    "white rice": 168877,       # sr: Rice, white, long-grain, regular, raw, enriched
    "brown rice": 169703,       # sr: Rice, brown, long-grain, raw
    "arborio rice": 168881,     # sr: Rice, white, short-grain, enriched, uncooked (risotto type)
    "pasta": 169736,            # sr: Pasta, dry, enriched
    "egg noodle": 169731,       # sr: Noodles, egg, dry, enriched
    "couscous": 169699,         # sr: Couscous, dry
    "quinoa": 168874,           # sr: Quinoa, uncooked
    "oat": 173904,              # sr: Cereals, oats, regular and quick, not fortified, dry
    "barley": 170284,           # sr: Barley, pearled, raw
    "bulgur": 170688,           # sr: Bulgur, dry
    "farro": 2710828,           # foundation: Farro, pearled, dry, raw (no SR equivalent)
    "cornmeal": 168867,         # sr: Cornmeal, degermed, enriched, yellow
    "breadcrumb": 174928,       # sr: Bread, crumbs, dry, grated, plain
    "bread": 325871,            # foundation: Bread, white, commercially prepared (full panel)
    "flour tortilla": 167535,   # sr: Tortillas, ready-to-bake or -fry, flour, shelf stable
    "corn tortilla": 175036,    # sr: Tortillas, ready-to-bake or -fry, corn
    "cracker": 172746,          # sr: Crackers, saltines (includes oyster, soda, soup)
    "popcorn": 167959,          # sr: Snacks, popcorn, air-popped
    # fats/oils
    "olive oil": 171413,        # sr: Oil, olive, salad or cooking
    "vegetable oil": 172336,    # sr: Oil, canola (universe alias)
    "sesame oil": 171016,       # sr: Oil, sesame, salad or cooking
    "coconut oil": 171412,      # sr: Oil, coconut
    "peanut oil": 171410,       # sr: Oil, peanut, salad or cooking
    # spices and dried herbs
    "salt": 173468,             # sr: Salt, table
    "black pepper": 170931,     # sr: Spices, pepper, black
    "cayenne pepper": 170932,   # sr: Spices, pepper, red or cayenne
    "red pepper flake": 170932, # sr: Spices, pepper, red or cayenne (closest equivalent)
    "paprika": 171329,          # sr: Spices, paprika
    "smoked paprika": 171329,   # sr: Spices, paprika (closest equivalent)
    "chili powder": 171319,     # sr: Spices, chili powder
    "cumin": 170923,            # sr: Spices, cumin seed
    "coriander": 170922,        # sr: Spices, coriander seed
    "turmeric": 172231,         # sr: Spices, turmeric, ground
    "curry powder": 170924,     # sr: Spices, curry powder
    "garlic powder": 171325,    # sr: Spices, garlic powder
    "onion powder": 171327,     # sr: Spices, onion powder
    "oregano": 171328,          # sr: Spices, oregano, dried
    "bay leaf": 170917,         # sr: Spices, bay leaf
    "cinnamon": 171320,         # sr: Spices, cinnamon, ground
    "nutmeg": 171326,           # sr: Spices, nutmeg, ground
    "clove": 171321,            # sr: Spices, cloves, ground
    "allspice": 171315,         # sr: Spices, allspice, ground
    "ground ginger": 170926,    # sr: Spices, ginger, ground
    "cardamom": 170919,         # sr: Spices, cardamom
    "fennel seed": 171323,      # sr: Spices, fennel seed
    "mustard powder": 170929,   # sr: Spices, mustard seed, ground
    "dried thyme": 170938,      # sr: Spices, thyme, dried
    "dried basil": 171317,      # sr: Spices, basil, dried
    # condiments
    "ketchup": 168556,          # sr: Catsup
    "mayonnaise": 171009,       # sr: Salad dressing, mayonnaise, regular
    "dijon mustard": 326698,    # foundation: Mustard, prepared, yellow (closest equivalent)
    "yellow mustard": 326698,   # foundation: Mustard, prepared, yellow
    "soy sauce": 174277,        # sr: Soy sauce made from soy and wheat (shoyu)
    "fish sauce": 174531,       # sr: Sauce, fish, ready-to-serve
    "worcestershire sauce": 171610,  # sr: Sauce, worcestershire
    "hot sauce": 174528,        # sr: Sauce, ready-to-serve, pepper, TABASCO
    "oyster sauce": 174529,     # sr: Sauce, oyster, ready-to-serve
    "balsamic vinegar": 172241, # sr: Vinegar, balsamic
    "red wine vinegar": 172240, # sr: Vinegar, red wine
    "white wine vinegar": 172240,  # sr: Vinegar, red wine (closest equivalent)
    "apple cider vinegar": 173469, # sr: Vinegar, cider
    "rice vinegar": 172237,     # sr: Vinegar, distilled (closest equivalent)
    "white vinegar": 172237,    # sr: Vinegar, distilled
    "maple syrup": 169661,      # sr: Syrups, maple
    "jam": 169641,              # sr: Jams and preserves
    "peanut butter": 324860,    # foundation: Peanut butter, smooth style, with salt (full panel)
    "almond butter": 168603,    # sr: Nuts, almond butter, plain, with salt added
    "tahini": 170189,           # sr: Seeds, sesame butter, tahini, from roasted and toasted kernels
    "olive": 169094,            # sr: Olives, ripe, canned (small-extra large)
    "caper": 172238,            # sr: Capers, canned
    "pickle": 168558,           # sr: Pickles, cucumber, dill or kosher dill
    "salsa": 174524,            # sr: Sauce, salsa, ready-to-serve
    "bbq sauce": 174523,        # sr: Sauce, barbecue
    "pesto": 171579,            # sr: Sauce, pesto, ready-to-serve, refrigerated
    # baking
    "all-purpose flour": 168894,   # sr: Wheat flour, white, all-purpose, enriched, bleached
    "whole-wheat flour": 168893,   # sr: Wheat flour, whole-grain
    "granulated sugar": 169655,    # sr: Sugars, granulated
    "brown sugar": 168833,         # sr: Sugars, brown
    "powdered sugar": 169656,      # sr: Sugars, powdered
    "baking soda": 175040,         # sr: Leavening agents, baking soda
    "baking powder": 172803,       # sr: Leavening agents, baking powder, double-acting, SAS
    "yeast": 175043,               # sr: Leavening agents, yeast, baker's, active dry
    "cocoa powder": 169593,        # sr: Cocoa, dry powder, unsweetened
    "chocolate chip": 167976,      # sr: Candies, semisweet chocolate
    "dark chocolate": 170273,      # sr: Chocolate, dark, 70-85% cacao solids
    "cream of tartar": 175041,     # sr: Leavening agents, cream of tartar
    # other
    "chicken broth": 174536,    # sr: Soup, chicken broth, ready-to-serve
    "beef broth": 171538,       # sr: Soup, beef broth or bouillon canned, ready-to-serve
    "vegetable broth": 171583,  # sr: Soup, vegetable broth, ready to serve
    "canned tomato": 170051,    # sr: Tomatoes, red, ripe, canned, packed in tomato juice
    "tomato paste": 170459,     # sr: Tomato products, canned, paste, without salt added
    "tomato sauce": 170054,     # sr: Tomato products, canned, sauce
    "coconut milk": 170173,     # sr: Nuts, coconut milk, canned
    "white wine": 174837,       # sr: Alcoholic beverage, wine, table, white
    "red wine": 173190,         # sr: Alcoholic beverage, wine, table, red
}

# name -> SR Legacy fdc_id to take foodPortion rows from when the primary
# match has none and the automatic SR tier-1 re-match also misses.
PORTION_OVERRIDES: dict[str, int] = {
    "egg": 171287,  # sr: Egg, whole, raw, fresh ("1 large" = 50 g etc.)
}


# --- normalization ---------------------------------------------------------
def singularize(tok: str) -> str:
    if len(tok) > 3 and tok.endswith("ies"):
        return tok[:-3] + "y"
    if len(tok) > 3 and (
        tok.endswith("oes")
        or tok.endswith("shes")
        or tok.endswith("ches")
        or tok.endswith("sses")
        or tok.endswith("xes")
        or tok.endswith("zes")
    ):
        return tok[:-2]
    if len(tok) > 2 and tok.endswith("s") and not tok.endswith("ss"):
        return tok[:-1]
    return tok


def normalize(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return " ".join(singularize(t) for t in s.split())


def strip_trailing_raw(desc: str) -> str:
    return re.sub(r",\s*raw\s*$", "", desc, flags=re.IGNORECASE)


# --- download + unzip ------------------------------------------------------
def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_release(key: str, workdir: Path) -> Path:
    rel = RELEASES[key]
    zip_path = workdir / Path(rel["url"]).name
    if not zip_path.exists():
        print(f"downloading {rel['url']} ...", file=sys.stderr)
        workdir.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(rel["url"], zip_path)
    digest = sha256_of(zip_path)
    if digest != rel["sha256"]:
        sys.exit(
            f"SHA256 mismatch for {zip_path.name}:\n  got      {digest}\n"
            f"  expected {rel['sha256']}\nRefusing to continue — the pinned "
            f"release changed upstream; re-verify and re-pin deliberately."
        )
    extract_dir = workdir / rel["dirname"]
    if not (extract_dir / "food.csv").exists():
        print(f"extracting {zip_path.name} ...", file=sys.stderr)
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(workdir)
        if not (extract_dir / "food.csv").exists():
            nested = workdir / rel["dirname"] / rel["dirname"]
            if (nested / "food.csv").exists():
                extract_dir = nested
    if not (extract_dir / "food.csv").exists():
        sys.exit(f"food.csv not found under {extract_dir}")
    return extract_dir


# --- csv loading ------------------------------------------------------------
def load_foods(extract_dir: Path, data_type: str) -> dict[int, str]:
    """fdc_id -> description, restricted to the dataset's own food rows."""
    foods: dict[int, str] = {}
    with (extract_dir / "food.csv").open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["data_type"] == data_type:
                foods[int(row["fdc_id"])] = row["description"]
    return foods


def load_nutrients(extract_dir: Path) -> dict[int, dict[int, float]]:
    """fdc_id -> {nutrient_id -> per-100g amount} for the panel nutrients."""
    out: dict[int, dict[int, float]] = {}
    with (extract_dir / "food_nutrient.csv").open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            nutrient_id = int(row["nutrient_id"])
            if nutrient_id not in NEEDED_NUTRIENT_IDS:
                continue
            amount = row["amount"].strip()
            if not amount:
                continue
            fdc_id = int(row["fdc_id"])
            # keep the first row if a duplicate (fdc_id, nutrient_id) appears
            out.setdefault(fdc_id, {}).setdefault(nutrient_id, float(amount))
    return out


def panel_coverage(per_food: dict[int, float]) -> int:
    """How many of the 8 panel fields this food's nutrient rows can fill."""
    return sum(1 for _col, ids in PANEL if any(i in per_food for i in ids))


def load_measure_units(extract_dir: Path) -> dict[int, str]:
    units: dict[int, str] = {}
    with (extract_dir / "measure_unit.csv").open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            units[int(row["id"])] = row["name"]
    return units


def load_portions(extract_dir: Path, wanted_fdc: set[int]) -> dict[int, list[dict]]:
    """fdc_id -> foodPortion rows (unit resolved via measure_unit)."""
    units = load_measure_units(extract_dir)
    out: dict[int, list[dict]] = {}
    with (extract_dir / "food_portion.csv").open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if not row["fdc_id"].strip():  # blank filler rows exist upstream
                continue
            fdc_id = int(row["fdc_id"])
            if fdc_id not in wanted_fdc:
                continue
            gram_weight = row["gram_weight"].strip()
            if not gram_weight:
                continue
            unit_name = units.get(int(row["measure_unit_id"] or 0), "")
            modifier = row["modifier"].strip()
            if unit_name in ("", "undetermined"):
                # SR Legacy keeps the household measure in `modifier`
                # ("cup, chopped", "tbsp chopped", "clove", "large"...) —
                # the first whitespace token of the first comma-segment is
                # the unit ("tbsp chopped" -> "tbsp"; "fruit (2-1/8\" dia)"
                # -> "fruit"). The full text stays in portion_description.
                segment = modifier.split(",")[0].strip().lower()
                if segment.startswith("fl oz") or segment.startswith("fluid ounce"):
                    unit = "fl oz"
                else:
                    unit = segment.split()[0] if segment else ""
            else:
                unit = unit_name.lower()
            desc_bits = [b for b in (row["portion_description"].strip(), modifier) if b]
            if not unit and desc_bits:
                # Foundation rows sometimes carry only portion_description
                unit = desc_bits[0].split(",")[0].strip().lower().split()[0]
            out.setdefault(fdc_id, []).append(
                {
                    "id": int(row["id"]),
                    "seq": int(row["seq_num"]) if row["seq_num"].strip() else 0,
                    "amount": float(row["amount"]) if row["amount"].strip() else 1.0,
                    "unit": unit,
                    "portion_description": " ".join(desc_bits),
                    "gram_weight": float(gram_weight),
                }
            )
    for rows in out.values():
        rows.sort(key=lambda r: (r["seq"], r["id"]))
    return out


# --- matching ---------------------------------------------------------------
def build_desc_index(foods: dict[int, str]) -> dict[str, list[int]]:
    """normalized description form -> fdc_ids carrying it."""
    idx: dict[str, list[int]] = {}
    for fdc_id, desc in foods.items():
        forms = {normalize(desc), normalize(strip_trailing_raw(desc))}
        for form in forms:
            idx.setdefault(form, []).append(fdc_id)
    for ids in idx.values():
        ids.sort()
    return idx


def tier1_match(name: str, idx: dict[str, list[int]]) -> tuple[int | None, bool]:
    """(fdc_id, ambiguous) — fdc_id set only on a unique hit."""
    hits = idx.get(normalize(name), [])
    if len(hits) == 1:
        return hits[0], False
    return None, len(hits) > 1


def match_universe(
    names: list[str],
    foods: dict[str, dict[int, str]],
    nutrients: dict[str, dict[int, dict[int, float]]],
) -> tuple[dict[str, tuple[int, str, str]], list[tuple[str, str]]]:
    """name -> (fdc_id, source_dataset, tier); plus [(name, why-unmatched)]."""
    idx = {ds: build_desc_index(foods[ds]) for ds in foods}
    matched: dict[str, tuple[int, str, str]] = {}
    unmatched: list[tuple[str, str]] = []
    for name in names:
        if name in FDC_OVERRIDES:
            fdc_id = FDC_OVERRIDES[name]
            ds = next((d for d in foods if fdc_id in foods[d]), None)
            if ds is None:
                sys.exit(f"FDC_OVERRIDES[{name!r}] = {fdc_id} is not a food row "
                         f"in either pinned dataset — fix the override.")
            matched[name] = (fdc_id, ds, "override")
            continue
        cands: list[tuple[int, int, str]] = []  # (coverage, fdc_id, ds)
        ambiguous = []
        for ds in ("foundation", "sr_legacy"):
            fdc_id, amb = tier1_match(name, idx[ds])
            if fdc_id is not None:
                cov = panel_coverage(nutrients[ds].get(fdc_id, {}))
                cands.append((cov, fdc_id, ds))
            elif amb:
                ambiguous.append(ds)
        if cands:
            # fullest panel wins; tie prefers foundation (listed first above)
            cands.sort(key=lambda c: -c[0])
            best_cov = cands[0][0]
            best = next(c for c in cands if c[0] == best_cov)
            matched[name] = (best[1], best[2], f"tier1-{best[2]}")
        elif ambiguous:
            unmatched.append((name, f"ambiguous in {'+'.join(ambiguous)}"))
        else:
            unmatched.append((name, "no hit"))
    return matched, unmatched


def sr_fallback_for_portions(name: str, sr_idx: dict[str, list[int]]) -> int | None:
    if name in PORTION_OVERRIDES:
        return PORTION_OVERRIDES[name]
    fdc_id, _ = tier1_match(name, sr_idx)
    return fdc_id


# --- output -----------------------------------------------------------------
def write_outputs(
    repo: Path,
    matched: dict[str, tuple[int, str, str]],
    foods: dict[str, dict[int, str]],
    nutrients: dict[str, dict[int, dict[int, float]]],
    portions: dict[str, dict[int, list[dict]]],
    sr_idx: dict[str, list[int]],
) -> tuple[int, int]:
    out_dir = repo / "data" / "usda"
    out_dir.mkdir(parents=True, exist_ok=True)

    n_path = out_dir / "nutrients.csv"
    with n_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            ["name", "fdc_id", "source_dataset", "usda_description"]
            + [col for col, _ in PANEL]
        )
        for name in sorted(matched):
            fdc_id, ds, _tier = matched[name]
            per_food = nutrients[ds].get(fdc_id, {})
            row = [name, fdc_id, ds, foods[ds][fdc_id]]
            for _col, ids in PANEL:
                val = next((per_food[i] for i in ids if i in per_food), None)
                row.append("" if val is None else f"{val:g}")
            w.writerow(row)

    p_path = out_dir / "portions.csv"
    n_portion_rows = 0
    with p_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            ["name", "fdc_id", "source_dataset", "amount", "unit",
             "portion_description", "gram_weight"]
        )
        for name in sorted(matched):
            fdc_id, ds, _tier = matched[name]
            rows = portions[ds].get(fdc_id, [])
            src_ds, src_id = ds, fdc_id
            if not rows and ds == "foundation":
                fb = sr_fallback_for_portions(name, sr_idx)
                if fb is not None and portions["sr_legacy"].get(fb):
                    rows = portions["sr_legacy"][fb]
                    src_ds, src_id = "sr_legacy", fb
            head = normalize(name).split()[-1]
            for r in rows:
                unit = r["unit"]
                # a portion measured in the food's own noun ("1 egg = 50.3g")
                # is the whole-item weight; normalize so drafts saying
                # qty=1 unit="whole" can use it.
                if normalize(unit) == head:
                    unit = "whole"
                w.writerow(
                    [name, src_id, src_ds, f"{r['amount']:g}", unit,
                     r["portion_description"], f"{r['gram_weight']:g}"]
                )
                n_portion_rows += 1
    return len(matched), n_portion_rows


# --- curation aid -----------------------------------------------------------
def print_candidates(
    unmatched: list[tuple[str, str]],
    foundation: dict[int, str],
    sr: dict[int, str],
    limit: int = 8,
) -> None:
    for name, why in unmatched:
        print(f"\n### {name}  ({why})")
        key = normalize(name)
        head = key.split()[-1]  # match on the head noun too
        for label, foods in (("foundation", foundation), ("sr_legacy", sr)):
            cands = [
                (fdc_id, desc)
                for fdc_id, desc in foods.items()
                if key in normalize(desc) or head in normalize(desc).split()
            ]
            cands.sort(key=lambda c: (len(c[1]), c[0]))
            for fdc_id, desc in cands[:limit]:
                print(f"  {label:10s} {fdc_id:7d}  {desc}")


# --- main -------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--workdir", required=True, type=Path,
                    help="scratch dir for raw zips + extraction (never committed)")
    ap.add_argument("--repo", type=Path, default=Path("."),
                    help="repo root (containing data/ingredients.csv)")
    ap.add_argument("--candidates", action="store_true",
                    help="print curation candidates for unmatched names and exit")
    ap.add_argument("--report", action="store_true",
                    help="print the full match report and exit (no files written)")
    args = ap.parse_args()

    universe_csv = args.repo / "data" / "ingredients.csv"
    with universe_csv.open(newline="", encoding="utf-8") as f:
        names = [row["name"] for row in csv.DictReader(f)]

    dirs = {k: ensure_release(k, args.workdir) for k in RELEASES}
    foods = {ds: load_foods(dirs[ds], RELEASES[ds]["data_type"]) for ds in RELEASES}
    nutrients = {ds: load_nutrients(dirs[ds]) for ds in RELEASES}
    matched, unmatched = match_universe(names, foods, nutrients)

    if args.candidates:
        print_candidates(unmatched, foods["foundation"], foods["sr_legacy"])
        return
    if args.report:
        for name in sorted(matched):
            fdc_id, ds, tier = matched[name]
            cov = panel_coverage(nutrients[ds].get(fdc_id, {}))
            print(f"{name:25s} {fdc_id:7d}  {ds:10s} {tier:16s} {cov}/8  "
                  f"{foods[ds][fdc_id]}")
        print(f"\nmatched {len(matched)}/{len(names)}; unmatched:")
        for name, why in unmatched:
            print(f"  {name}  ({why})")
        return

    sr_idx = build_desc_index(foods["sr_legacy"])
    wanted = {
        ds: {fdc_id for fdc_id, d, _ in matched.values() if d == ds}
        for ds in ("foundation", "sr_legacy")
    }
    # portion fallback + overrides may pull extra SR foods
    for name in matched:
        fb = sr_fallback_for_portions(name, sr_idx)
        if fb is not None:
            wanted["sr_legacy"].add(fb)
    portions = {ds: load_portions(dirs[ds], wanted[ds]) for ds in dirs}

    n_matched, n_portions = write_outputs(
        args.repo, matched, foods, nutrients, portions, sr_idx)
    print(f"matched {n_matched}/{len(names)} universe names "
          f"({len(unmatched)} unmatched); wrote {n_matched} nutrient rows, "
          f"{n_portions} portion rows to {args.repo / 'data' / 'usda'}")
    if unmatched:
        print("unmatched (left [unverified] downstream):")
        for name, why in unmatched:
            print(f"  {name}  ({why})")


if __name__ == "__main__":
    main()
