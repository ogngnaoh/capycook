#!/usr/bin/env python3
"""Vendor the [approximate] cost table for the CapyCook ingredient universe.

Rebuilds the official-source rows of ``data/cost/prices.csv`` from two named
public price programs, preserving the hand-authored estimate rows already in
the file (the "tier B" rows — see the tier split below). The output covers
every row of ``data/ingredients.csv`` exactly once, in universe order.

The table is [approximate] BY DESIGN and is NOT USDA-nutrition-attributed
(DESIGN.md tier split: cost is the approximate tier). Provenance narrative,
artifact pins, and conversion rules: ``data/cost/PROVENANCE.md``.

Sources (downloaded into ``--workdir``, never committed):

  BLS Average Price Data (AP program, U.S. city average, monthly)
    https://download.bls.gov/pub/time.series/ap/ap.data.0.Current
    https://download.bls.gov/pub/time.series/ap/ap.item
    https://download.bls.gov/pub/time.series/ap/ap.txt        (program readme)
  USDA ERS Fruit and Vegetable Prices (combined CSVs; 2023 Circana
  OmniMarket Core Outlets scanner data; release updated 2025-12-09)
    https://www.ers.usda.gov/media/6210/all-fruits-average-prices-csv-format.csv
    https://www.ers.usda.gov/media/6240/all-vegetables-average-prices-csv-format.csv

Both programs publish *rolling* files (BLS updates monthly; ERS re-releases),
so unlike scripts/vendor_usda.py the SHA256 pins below are advisory: a
mismatch prints a loud warning with the new hash (update PROVENANCE.md and
re-review at Gate A) instead of aborting.

Tier split (sanctioned two-tier procedure, stated for Gate A review):
  Tier A — a row whose ingredient is covered by a live BLS AP series or an
      ERS Fruit & Vegetable Prices item gets that official source, the series
      id / item label, the observed price, and its observation period as
      ``as_of``. BLS (fresher, 2026 monthly) wins over ERS (2023) when both
      cover an ingredient. This script regenerates these rows.
  Tier B — every other row is a hand-authored builder estimate with the
      uniform source string ``estimate: ...`` and the estimation basis stated
      in PROVENANCE.md. This script preserves those rows verbatim and FAILS
      if any universe ingredient has neither a tier-A mapping nor an existing
      tier-B row.

Unit conversions (exact factors; details in PROVENANCE.md):
  per lb        -> usd/100g   divide by 4.5359237 (453.59237 g/lb)
  per N oz      -> usd/100g   divide by N * 0.283495231 (28.3495231 g/oz)
  per dozen     -> usd/unit   divide by 12 (eggs)
  per gallon    -> usd/100g   via the food's first volume row in
  per liter                   data/usda/portions.csv (vendored FDC gram
                              weights) — a density is never assumed.

Dependencies: Python 3.9+ standard library only (argparse, csv, hashlib,
pathlib, sys, urllib.request). No third-party packages.

Usage:
    python3 scripts/vendor_cost.py --workdir /path/to/scratch [--repo .]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import sys
import urllib.request
from pathlib import Path

# BLS asks automated clients to identify themselves with contact info.
USER_AGENT = (
    "Mozilla/5.0 (compatible; CapyCook-vendor/1.0; "
    "contact: ngoviethoang9@gmail.com)"
)

ARTIFACTS = {
    "ap.data.0.Current": "https://download.bls.gov/pub/time.series/ap/ap.data.0.Current",
    "ap.item": "https://download.bls.gov/pub/time.series/ap/ap.item",
    "ap.txt": "https://download.bls.gov/pub/time.series/ap/ap.txt",
    "all-fruits-average-prices-csv-format.csv": (
        "https://www.ers.usda.gov/media/6210/all-fruits-average-prices-csv-format.csv?v=22396"
    ),
    "all-vegetables-average-prices-csv-format.csv": (
        "https://www.ers.usda.gov/media/6240/all-vegetables-average-prices-csv-format.csv?v=55841"
    ),
}

# Advisory pins from the 2026-07-06 vendoring run (rolling upstream files —
# a mismatch warns loudly instead of aborting; see module docstring).
EXPECTED_SHA256 = {
    "ap.data.0.Current": "9122d018f1af426680939ec7e027acf18bb8299a5a9ca3b3c32527fe895e7d8f",
    "ap.item": "4e96f3bca741f65692971fdec8053a44f7ee20f47a02eace4c4d3d9a1dd148f6",
    "ap.txt": "c83886f9a54f113a093c4251d5893233854407e382ae0d5209ffb09f791e7864",
    "all-fruits-average-prices-csv-format.csv": (
        "b7fc0b4a9c11d7ff1599959297da3c175efdbb6bb7e543e5493f4acc06f0d45d"
    ),
    "all-vegetables-average-prices-csv-format.csv": (
        "7228c4bccd6a60c6e383aff930a2c76e8daca045eda61945e484e632b26aa406"
    ),
}

GRAMS_PER_LB = 453.59237
GRAMS_PER_OZ = 28.349523125
ML_PER_GALLON = 3785.411784
ML_PER_LITER = 1000.0

# Exact ml per normalized volume unit token in data/usda/portions.csv
# (mirrors internal/services/units.go volumeToML).
ML_PER_UNIT = {
    "ml": 1.0,
    "l": 1000.0,
    "tsp": 4.92892159375,
    "tbsp": 14.78676478125,
    "tablespoon": 14.78676478125,  # olive oil row keeps the long spelling
    "fl oz": 29.5735295625,
    "cup": 236.5882365,
    "pint": 473.176473,
    "quart": 946.352946,
    "gallon": 3785.411784,
}

# BLS AP series (U.S. city average => series id "APU0000" + item code).
# transform: how the published price becomes usd_per_unit at unit_basis.
#   ("per_lb",)              price per lb          -> per_100g
#   ("per_oz", N)            price per N oz        -> per_100g
#   ("per_dozen",)           price per dozen       -> per_unit
#   ("per_volume", ml)       price per ml-volume   -> per_100g via portions
BLS_ROWS = {
    "all-purpose flour": ("701111", "Flour, white, all purpose, per lb.", ("per_lb",)),
    "white rice": ("701312", "Rice, white, long grain, uncooked, per lb.", ("per_lb",)),
    "pasta": ("701322", "Spaghetti and macaroni, per lb.", ("per_lb",)),
    "bread": ("702111", "Bread, white, pan, per lb.", ("per_lb",)),
    "ground beef": ("703112", "Ground beef, 100% beef, per lb.", ("per_lb",)),
    "beef chuck roast": ("703213", "Chuck roast, USDA Choice, boneless, per lb.", ("per_lb",)),
    "beef steak": ("FC3101", "All Uncooked Beef Steaks, per lb.", ("per_lb",)),
    "bacon": ("704111", "Bacon, sliced, per lb.", ("per_lb",)),
    "pork chop": ("FD3101", "All Pork Chops, per lb.", ("per_lb",)),
    "ham": ("FD2101", "All Ham (Excluding Canned Ham and Luncheon Slices), per lb.", ("per_lb",)),
    "whole chicken": ("706111", "Chicken, fresh, whole, per lb.", ("per_lb",)),
    "chicken breast": ("FF1101", "Chicken breast, boneless, per lb.", ("per_lb",)),
    "egg": ("708111", "Eggs, grade A, large, per doz.", ("per_dozen",)),
    "milk": ("709112", "Milk, fresh, whole, fortified, per gal.", ("per_volume", ML_PER_GALLON, "/gal")),
    "butter": ("FS1101", "Butter, stick, per lb.", ("per_lb",)),
    "yogurt": ("FJ4101", "Yogurt, per 8 oz.", ("per_oz", 8)),
    "cheddar": ("710212", "Cheddar cheese, natural, per lb.", ("per_lb",)),
    "banana": ("711211", "Bananas, per lb.", ("per_lb",)),
    "orange": ("711311", "Oranges, Navel, per lb.", ("per_lb",)),
    "grapefruit": ("711411", "Grapefruit, per lb.", ("per_lb",)),
    "lemon": ("711412", "Lemons, per lb.", ("per_lb",)),
    "strawberry": ("711415", "Strawberries, dry pint, per 12 oz.", ("per_oz", 12)),
    "potato": ("712112", "Potatoes, white, per lb.", ("per_lb",)),
    "lettuce": ("712211", "Lettuce, iceberg, per lb.", ("per_lb",)),
    "romaine lettuce": ("FL2101", "Lettuce, romaine, per lb.", ("per_lb",)),
    "tomato": ("712311", "Tomatoes, field grown, per lb.", ("per_lb",)),
    # No cannellini-specific series anywhere (ERS has black/kidney/navy/pinto
    # but not cannellini); the generic dried-beans series is the honest
    # closest match and is named as such in the source cell.
    "cannellini bean": ("714233", "Beans, dried, any type, all sizes, per lb.", ("per_lb",)),
    "granulated sugar": ("715211", "Sugar, white, all sizes, per lb.", ("per_lb",)),
    "white wine": (
        "720311",
        "Wine, red and white table, all sizes, any origin, per 1 liter",
        ("per_volume", ML_PER_LITER, "/L"),
    ),
    "red wine": (
        "720311",
        "Wine, red and white table, all sizes, any origin, per 1 liter",
        ("per_volume", ML_PER_LITER, "/L"),
    ),
}

# USDA ERS Fruit and Vegetable Prices items: universe name -> (file key,
# exact item label, form). All selected rows are priced per pound (asserted).
# Where the exact universe item is absent, the closest as-purchased item/form
# is used and its label is visible in the source cell (e.g. bell pepper ->
# "Green peppers"; pumpkin/beet/olive -> Canned; green pea -> Frozen).
FRUITS = "all-fruits-average-prices-csv-format.csv"
VEGS = "all-vegetables-average-prices-csv-format.csv"
ERS_ROWS = {
    "apple": (FRUITS, "Apples", "Fresh"),
    "blackberry": (FRUITS, "Blackberries", "Fresh"),
    "blueberry": (FRUITS, "Blueberries", "Fresh"),
    "cantaloupe": (FRUITS, "Cantaloupe", "Fresh"),
    "cherry": (FRUITS, "Cherries", "Fresh"),
    "dried apricot": (FRUITS, "Apricots", "Dried"),
    "raisin": (FRUITS, "Grapes (raisins)", "Dried"),
    "dried cranberry": (FRUITS, "Cranberries", "Dried"),
    "date": (FRUITS, "Dates", "Dried"),
    "grape": (FRUITS, "Grapes", "Fresh"),
    "kiwi": (FRUITS, "Kiwi", "Fresh"),
    "mango": (FRUITS, "Mangoes", "Fresh"),
    "peach": (FRUITS, "Peaches", "Fresh"),
    "pear": (FRUITS, "Pears", "Fresh"),
    "pineapple": (FRUITS, "Pineapple", "Fresh"),
    "plum": (FRUITS, "Plum", "Fresh"),
    "raspberry": (FRUITS, "Raspberries", "Fresh"),
    "watermelon": (FRUITS, "Watermelon", "Fresh"),
    "asparagus": (VEGS, "Asparagus", "Fresh"),
    "avocado": (VEGS, "Avocados", "Fresh"),
    "beet": (VEGS, "Beets", "Canned"),
    "bell pepper": (VEGS, "Green peppers", "Fresh"),
    "black bean": (VEGS, "Black beans", "Dried"),
    "broccoli": (VEGS, "Broccoli heads", "Fresh"),
    "brussels sprout": (VEGS, "Brussels sprouts", "Fresh"),
    "butternut squash": (VEGS, "Butternut squash", "Fresh"),
    "cabbage": (VEGS, "Cabbage, green", "Fresh"),
    "canned tomato": (VEGS, "Tomatoes", "Canned"),
    "carrot": (VEGS, "Carrots, raw whole", "Fresh"),
    "cauliflower": (VEGS, "Cauliflower heads", "Fresh"),
    "celery": (VEGS, "Celery, trimmed bunches", "Fresh"),
    "cherry tomato": (VEGS, "Tomatoes, grape and cherry", "Fresh"),
    "collard greens": (VEGS, "Collard greens", "Fresh"),
    "corn": (VEGS, "Corn", "Fresh"),
    "cucumber": (VEGS, "Cucumbers with peel", "Fresh"),
    "green bean": (VEGS, "Green beans", "Fresh"),
    "green pea": (VEGS, "Green peas", "Frozen"),
    "kale": (VEGS, "Kale", "Fresh"),
    "kidney bean": (VEGS, "Kidney beans", "Dried"),
    "lentil": (VEGS, "Lentils", "Dried"),
    "mushroom": (VEGS, "Mushrooms, whole", "Fresh"),
    "navy bean": (VEGS, "Navy beans", "Dried"),
    "olive": (VEGS, "Olives", "Canned"),
    "onion": (VEGS, "Onions", "Fresh"),
    "pinto bean": (VEGS, "Pinto beans", "Dried"),
    "pumpkin": (VEGS, "Pumpkin", "Canned"),
    "radish": (VEGS, "Radish", "Fresh"),
    "spinach": (VEGS, "Spinach, eaten raw", "Fresh"),
    "sweet potato": (VEGS, "Sweet potatoes", "Fresh"),
    "zucchini": (VEGS, "Zucchini", "Fresh"),
}

ERS_SOURCE_SUFFIX = "2023 Circana scanner data (ERS release updated 2025-12-09)"
ERS_AS_OF = "2023"

# The oldest BLS observation month accepted; several AP food series are
# discontinued (e.g. canned tuna last published 2017-09) and silently using a
# stale figure would be misleading — those ingredients stay tier B instead.
BLS_MIN_YEAR = 2025


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(workdir: Path) -> None:
    for name, url in ARTIFACTS.items():
        dest = workdir / name
        if dest.exists():
            print(f"cached  {name}")
        else:
            print(f"fetch   {url}")
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req) as resp, dest.open("wb") as out:
                out.write(resp.read())
        digest = sha256_of(dest)
        if digest != EXPECTED_SHA256[name]:
            print(
                f"WARNING: {name} sha256 {digest} != pinned "
                f"{EXPECTED_SHA256[name]} — upstream rolling file changed; "
                "update data/cost/PROVENANCE.md and re-review at Gate A",
                file=sys.stderr,
            )


def load_universe(repo: Path) -> list[str]:
    with (repo / "data" / "ingredients.csv").open(newline="", encoding="utf-8") as f:
        return [row["name"] for row in csv.DictReader(f)]


def load_bls_latest(workdir: Path) -> dict[str, tuple[str, float]]:
    """series id -> (YYYY-MM of latest monthly observation, price)."""
    latest: dict[str, tuple[int, int, float]] = {}
    with (workdir / "ap.data.0.Current").open(encoding="utf-8") as f:
        next(f)  # header
        for line in f:
            parts = [p.strip() for p in line.split("\t")]
            if len(parts) < 4:
                continue
            series, year, period, value = parts[0], parts[1], parts[2], parts[3]
            if not period.startswith("M") or period == "M13":
                continue  # monthly observations only (M13 = annual average)
            try:
                y, m, v = int(year), int(period[1:]), float(value)
            except ValueError:
                continue  # '-' = not available
            if series not in latest or (y, m) > latest[series][:2]:
                latest[series] = (y, m, v)
    return {s: (f"{y:04d}-{m:02d}", v) for s, (y, m, v) in latest.items()}


def load_ers(workdir: Path) -> dict[tuple[str, str, str], float]:
    """(file key, item, form) -> price per pound (asserted per-pound)."""
    prices: dict[tuple[str, str, str], float] = {}
    for key in (FRUITS, VEGS):
        with (workdir / key).open(newline="", encoding="utf-8-sig") as f:
            for row in csv.reader(f):
                if not row or row[1] == "Form":
                    continue
                item, form, price, unit = row[0], row[1], row[2], row[3]
                prices[(key, item, form)] = (
                    float(price) if unit.startswith("per pound") else float("nan")
                )
    return prices


def portion_density_g_per_ml(repo: Path, food: str) -> tuple[float, str]:
    """Density from the food's first volume row in data/usda/portions.csv."""
    with (repo / "data" / "usda" / "portions.csv").open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["name"] != food:
                continue
            ml = ML_PER_UNIT.get(row["unit"])
            if ml is None:
                continue
            density = float(row["gram_weight"]) / (float(row["amount"]) * ml)
            note = f"{row['amount']} {row['unit']} = {row['gram_weight']} g"
            return density, note
    raise SystemExit(f"no volume portion row for {food!r} in data/usda/portions.csv")


def build_official_rows(repo: Path, workdir: Path) -> dict[str, dict[str, str]]:
    bls = load_bls_latest(workdir)
    ers = load_ers(workdir)
    rows: dict[str, dict[str, str]] = {}

    for name, (code, label, transform) in BLS_ROWS.items():
        series = f"APU0000{code}"
        if series not in bls:
            raise SystemExit(f"BLS series {series} ({label}) has no monthly data")
        as_of, price = bls[series]
        if int(as_of[:4]) < BLS_MIN_YEAR:
            raise SystemExit(
                f"BLS series {series} ({label}) is stale (latest {as_of}); "
                "move the ingredient to tier B instead of using a dead series"
            )
        src = f"BLS Average Price series {series} ({label}), U.S. city average, {as_of}: ${price}"
        if transform[0] == "per_lb":
            usd, basis = price / GRAMS_PER_LB * 100, "per_100g"
            src += "/lb"
        elif transform[0] == "per_oz":
            n = transform[1]
            usd, basis = price / (n * GRAMS_PER_OZ) * 100, "per_100g"
            src += f" per {n} oz"
        elif transform[0] == "per_dozen":
            usd, basis = price / 12, "per_unit"
            src += "/doz / 12"
        elif transform[0] == "per_volume":
            density, note = portion_density_g_per_ml(repo, name)
            usd, basis = price / (transform[1] * density) * 100, "per_100g"
            src += f"{transform[2]}; grams via USDA portion row {note}"
        else:  # pragma: no cover - mapping typo guard
            raise SystemExit(f"unknown transform {transform!r} for {name}")
        rows[name] = {
            "name": name,
            "usd_per_unit": f"{usd:.4f}",
            "unit_basis": basis,
            "source": src,
            "as_of": as_of,
        }

    for name, (key, item, form) in ERS_ROWS.items():
        price = ers.get((key, item, form))
        if price is None:
            raise SystemExit(f"ERS item {item!r} ({form}) not found in {key}")
        if price != price:  # NaN: not per-pound priced
            raise SystemExit(f"ERS item {item!r} ({form}) is not priced per pound")
        rows[name] = {
            "name": name,
            "usd_per_unit": f"{price / GRAMS_PER_LB * 100:.4f}",
            "unit_basis": "per_100g",
            "source": (
                f"USDA ERS Fruit and Vegetable Prices, item '{item}' ({form}): "
                f"${price:.4f}/lb, {ERS_SOURCE_SUFFIX}"
            ),
            "as_of": ERS_AS_OF,
        }
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--workdir", required=True, type=Path)
    ap.add_argument("--repo", default=".", type=Path)
    args = ap.parse_args()
    args.workdir.mkdir(parents=True, exist_ok=True)

    fetch(args.workdir)
    universe = load_universe(args.repo)
    official = build_official_rows(args.repo, args.workdir)

    prices_path = args.repo / "data" / "cost" / "prices.csv"
    preserved: dict[str, dict[str, str]] = {}
    if prices_path.exists():
        with prices_path.open(newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row["name"] not in official:
                    preserved[row["name"]] = row

    missing = [n for n in universe if n not in official and n not in preserved]
    if missing:
        raise SystemExit(
            "universe ingredients with neither an official series mapping nor "
            f"an existing tier-B estimate row: {', '.join(missing)}"
        )
    extra = (set(official) | set(preserved)) - set(universe)
    if extra:
        raise SystemExit(f"rows outside the universe: {', '.join(sorted(extra))}")

    prices_path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["name", "usd_per_unit", "unit_basis", "source", "as_of"]
    with prices_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for name in universe:
            w.writerow(official.get(name) or preserved[name])

    print(
        f"wrote {prices_path}: {len(universe)} rows "
        f"({len(BLS_ROWS)} BLS, {len(ERS_ROWS)} ERS, {len(preserved)} estimate)"
    )
    for name in ARTIFACTS:
        print(f"sha256 {sha256_of(args.workdir / name)}  {name}")


if __name__ == "__main__":
    main()
