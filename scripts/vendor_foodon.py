#!/usr/bin/env python3
"""Vendor the FoodOn-derived Big-9 allergen closure for the CapyCook universe.

Downloads the pinned FoodOn OWL release, verifies its SHA256, maps each
canonical ingredient in ``data/ingredients.csv`` to a FoodOn class, computes
the transitive closure up FoodOn's is_a + composition hierarchy to nine
allergen "anchor" classes (one group per FDA Big-9 allergen), and writes the
committed subset:

  data/foodon/allergens.csv  — name, foodon_id, big9, mapping_method

It also mirrors the closure's Big-9 flags into the ``big9_flags`` column of
``data/ingredients.csv`` (allergens.csv stays the source of truth).

The raw ~42 MB OWL stays in ``--workdir`` (scratch) and is NEVER committed;
only the universe-bounded closure table above lands in the repo. Provenance
(URL, release tag, SHA256, anchor classes, curation) is recorded in
``data/foodon/PROVENANCE.md`` and enforced by this script's pinned hash.

Dependencies: Python 3.9+ standard library only (argparse, csv, hashlib,
pathlib, re, sys, urllib.request, xml.etree.ElementTree). No third-party
packages; no venv required. Re-runnable: ``python3 scripts/vendor_foodon.py
--workdir <scratch>`` reproduces allergens.csv byte-for-byte from the pinned
release.

Usage:
    python3 scripts/vendor_foodon.py --workdir /path/to/scratch [--repo .]
    python3 scripts/vendor_foodon.py --workdir ... --report   # mapping report

Closure model (documented for Gate A review)
--------------------------------------------
FoodOn is an is_a taxonomy plus object-property axioms. Allergen identity is
carried "upward" from an ingredient class along four relations:

  * rdfs:subClassOf            (is_a — genus/species)
  * RO:0001000  derives from            (butter derives from cow milk)
  * FOODON:00001563  has defining ingredient   (cheese has def. ingr. milk curd)
  * FOODON:00002420  has ingredient

The task specifies "is_a / derives-from"; the two composition relations are
included as well because an allergen carries through composition (cheese is a
milk allergen via its defining ingredient, not via genus). This can only ADD
detections, never remove them — the safe direction for a fail-closed gate.

For each mapped ingredient class we take the reflexive-transitive closure over
those relations and test membership of nine anchor groups. Reaching any anchor
in a group assigns that allergen.

Anchor classes (verified present in the pinned release; labels in PROVENANCE.md):
  milk                 FOODON_00001257 milk or milk based food product
                       FOODON_00001256 dairy food product
                       UBERON_0001913  milk
  eggs                 FOODON_00001274 egg food product
  fish                 FOODON_03411222 fish
                       NCBITaxon_7898  Actinopterygii (ray-finned fishes)
  crustacean shellfish FOODON_03411374 crustacean
                       NCBITaxon_6657  Crustacea
  tree nuts            FOODON_00001172 nut food product   (minus peanut, below)
  peanuts              FOODON_00002099 peanut food product
                       NCBITaxon_3818  Arachis hypogaea
  wheat                FOODON_03411312 wheat plant
                       NCBITaxon_4564  Triticum
  soybeans             FOODON_03301415 soybean
                       NCBITaxon_3847  Glycine max
  sesame               FOODON_03310306 sesame seed
                       NCBITaxon_4182  Sesamum indicum

Peanut/tree-nut rule: FoodOn files "peanut (whole or pieces)" under
"nut food product", but FDA separates peanut (a legume) from tree nuts. When a
class reaches BOTH the nut-food-product anchor and a peanut anchor it is
classified peanuts-only, never tree nuts.

Ingredient -> FoodOn class mapping (deterministic)
--------------------------------------------------
  Tier 0 — curated override: FOODON_OVERRIDES[name] is a hand-picked class id
      (used where the label/alias match is absent or wrong; every pick is a
      real FoodOn class, listed in PROVENANCE.md).
  Tier 1 — normalized exact match of the canonical name against FoodOn class
      rdfs:label, then go:hasExactSynonym. normalize = lowercase, non-alnum to
      space, naive-singularize each token (same rule as vendor_usda.py and the
      Go resolver). Deterministic pick among candidates: FOODON_ ids over
      external ontology ids; then labels ending "food product"; then shortest
      label; then lexicographically smallest id.
  Tier 2 — same match run over each alias in ingredients.csv (e.g. "cheddar"
      resolves through its alias "cheddar cheese").
  Unmapped — no FoodOn class; the row's big9 comes from curation only (spices,
      vinegars, sugars carry no Big-9 allergen), and mapping_method says so.

Curated allergen additions (FoodOn cannot express these compositionally)
------------------------------------------------------------------------
A handful of processed/composite foods are modelled in FoodOn as generic
condiments/sauces with no ingredient-level allergen link, so the closure finds
nothing. Their Big-9 status is added from recipe composition + FDA labelling
norms (ALLERGEN_ADD below; each row is annotated in PROVENANCE.md). Additions
only union with the closure — they never remove a computed allergen.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

# --- pinned release --------------------------------------------------------
# URL + SHA256 verified against the GitHub release downloaded 2026-07-06.
# owl:versionIRI inside the file: .../foodon/releases/2025-01-29/foodon.owl
RELEASE = {
    "url": "https://github.com/FoodOntology/foodon/releases/download/v2025-01-29/foodon.owl",
    "tag": "v2025-01-29",
    "sha256": "c9a232096f4cc794825a96ccff4b061946ac7234bec4a70e350299f3d0d7ec14",
    "filename": "foodon.owl",
}

RDF = "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}"
RDFS = "{http://www.w3.org/2000/01/rdf-schema#}"
OWL = "{http://www.w3.org/2002/07/owl#}"
GO = "{http://www.geneontology.org/formats/oboInOwl#}"
OBO = "http://purl.obolibrary.org/obo/"
ABOUT = RDF + "about"
RES = RDF + "resource"

# object properties whose someValuesFrom target carries allergen identity upward
UP_PROPS = {
    "RO_0001000",       # derives from
    "FOODON_00001563",  # has defining ingredient
    "FOODON_00002420",  # has ingredient
}

# --- allergen anchors ------------------------------------------------------
# Big-9 allergen -> set of FoodOn/external class ids that anchor it. Reaching
# any id in a group (via the closure) assigns the allergen.
ANCHORS = {
    "milk": ["FOODON_00001257", "FOODON_00001256", "UBERON_0001913"],
    "eggs": ["FOODON_00001274"],
    "fish": ["FOODON_03411222", "NCBITaxon_7898"],
    "crustacean shellfish": ["FOODON_03411374", "NCBITaxon_6657"],
    "tree nuts": ["FOODON_00001172"],
    "peanuts": ["FOODON_00002099", "NCBITaxon_3818"],
    "wheat": ["FOODON_03411312", "NCBITaxon_4564"],
    "soybeans": ["FOODON_03301415", "NCBITaxon_3847"],
    "sesame": ["FOODON_03310306", "NCBITaxon_4182"],
}
BIG9_ORDER = [
    "milk", "eggs", "fish", "crustacean shellfish", "tree nuts",
    "peanuts", "wheat", "soybeans", "sesame",
]

# --- curated ingredient -> FoodOn class overrides (tier 0) -----------------
# Used where the label/alias match is missing or maps to a wrong-identity class.
# Every id was looked up in — and verified present in — the pinned release; each
# picked class's closure was checked to reach the intended allergen anchor.
FOODON_OVERRIDES = {
    # cheeses + cultured dairy -> milk (allergen-critical)
    "cheddar": "FOODON_03302458",       # cheddar cheese
    "mozzarella": "FOODON_03303578",    # mozzarella cheese
    "parmesan": "FOODON_00003247",      # parmesan cheese food product
    "feta": "FOODON_03307280",          # feta cheese
    "ricotta": "FOODON_03302908",       # ricotta cheese
    "goat cheese": "FOODON_03303655",   # goat milk cheese
    "buttermilk": "FOODON_00002398",    # mammalian buttermilk
    "yogurt": "FOODON_00001014",        # yogurt food product
    # egg / fish / wheat carriers
    "egg": "FOODON_03316061",           # chicken egg -> eggs
    "canned tuna": "FOODON_03411269",   # tuna -> fish
    "all-purpose flour": "FOODON_03302339",  # white wheat flour -> wheat
    "couscous": "FOODON_03303207",      # couscous (dried) -> wheat
    "flour tortilla": "FOODON_03307668",  # tortilla (wheat added via ALLERGEN_ADD)
    # non-allergen items with no name-label match (better than a blank row)
    "jalapeno": "FOODON_00003494",      # jalapeno pepper
    "zucchini": "FOODON_00002448",      # zucchini food product
}

# --- curated Big-9 additions (composition/labelling, FoodOn can't express) --
# name -> (set of Big-9 allergens, short basis). Union-only with the closure:
# FoodOn models these as generic condiments/sauces/breads with no
# ingredient-level allergen link, so the closure finds nothing. Status added
# from recipe composition + FDA labelling norms (documented in PROVENANCE.md).
ALLERGEN_ADD = {
    "mayonnaise": ({"eggs"}, "emulsion of egg yolk"),
    "tahini": ({"sesame"}, "ground sesame seed"),
    "sesame oil": ({"sesame"}, "pressed from sesame seed (unrefined toasted oil retains protein)"),
    "soy sauce": ({"soybeans", "wheat"}, "brewed from soybeans + wheat (shoyu)"),
    "fish sauce": ({"fish"}, "fermented anchovy extract"),
    "worcestershire sauce": ({"fish"}, "contains anchovies"),
    "pesto": ({"milk", "tree nuts"}, "basil pesto: parmesan + pine nuts/walnuts"),
    "bread": ({"wheat"}, "wheat-based staple (Western default)"),
    "breadcrumb": ({"wheat"}, "made from wheat bread"),
    "cracker": ({"wheat"}, "wheat-based (saltine)"),
    "flour tortilla": ({"wheat"}, "wheat-flour flatbread"),
    "farro": ({"wheat"}, "farro is a hulled wheat (Triticum)"),
}


# --- normalization (shared rule with vendor_usda.py / the Go resolver) ------
def singularize(tok: str) -> str:
    if len(tok) > 3 and tok.endswith("ies"):
        return tok[:-3] + "y"
    if len(tok) > 3 and tok.endswith(("oes", "shes", "ches", "sses", "xes", "zes")):
        return tok[:-2]
    if len(tok) > 2 and tok.endswith("s") and not tok.endswith("ss"):
        return tok[:-1]
    return tok


def normalize(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return " ".join(singularize(t) for t in s.split())


def short(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


# --- download --------------------------------------------------------------
def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_release(workdir: Path) -> Path:
    path = workdir / RELEASE["filename"]
    if not path.exists():
        print(f"downloading {RELEASE['url']} ...", file=sys.stderr)
        workdir.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(RELEASE["url"], path)
    digest = sha256_of(path)
    if digest != RELEASE["sha256"]:
        sys.exit(
            f"SHA256 mismatch for {path.name}:\n  got      {digest}\n"
            f"  expected {RELEASE['sha256']}\nRefusing to continue — the pinned "
            f"release changed upstream; re-verify and re-pin deliberately."
        )
    return path


# --- parse -----------------------------------------------------------------
class FoodOn:
    def __init__(self):
        self.label: dict[str, str] = {}
        self.isa: dict[str, set] = {}
        self.up: dict[str, set] = {}
        self.by_label: dict[str, list] = {}
        self.by_syn: dict[str, list] = {}

    @classmethod
    def load(cls, owl_path: Path) -> "FoodOn":
        fo = cls()
        for _ev, elem in ET.iterparse(str(owl_path), events=("end",)):
            if elem.tag == OWL + "Class" and elem.get(ABOUT):
                fo._process(elem)
                elem.clear()
        # build normalized-label / synonym indexes
        for iri, lab in fo.label.items():
            fo.by_label.setdefault(normalize(lab), []).append(iri)
        return fo

    def _process(self, cls_el) -> None:
        iri = cls_el.get(ABOUT)
        lab = cls_el.find(RDFS + "label")
        if lab is not None and lab.text:
            self.label[iri] = " ".join(lab.text.split())
        for syn_el in cls_el.findall(GO + "hasExactSynonym"):
            if syn_el.text:
                self.by_syn.setdefault(normalize(syn_el.text), []).append(iri)
        parents = {sc.get(RES) for sc in cls_el.findall(RDFS + "subClassOf") if sc.get(RES)}
        if parents:
            self.isa[iri] = parents
        edges = set()
        for restr in cls_el.iter(OWL + "Restriction"):
            op = restr.find(OWL + "onProperty")
            sv = restr.find(OWL + "someValuesFrom")
            if op is None or sv is None:
                continue
            prop, tgt = op.get(RES), sv.get(RES)
            if prop and tgt and short(prop) in UP_PROPS:
                edges.add(tgt)
        if edges:
            self.up[iri] = edges

    def ancestors(self, start: str) -> set:
        seen, stack = set(), [start]
        while stack:
            n = stack.pop()
            if n in seen:
                continue
            seen.add(n)
            stack.extend(self.isa.get(n, ()))
            stack.extend(self.up.get(n, ()))
        return seen

    def pick(self, name: str) -> str | None:
        n = normalize(name)
        cands = self.by_label.get(n) or self.by_syn.get(n)
        if not cands:
            return None
        foodon = [c for c in cands if short(c).startswith("FOODON_")]
        pool = foodon or cands
        return sorted(pool, key=lambda c: (
            0 if c in foodon else 1,
            0 if self.label.get(c, "").endswith("food product") else 1,
            len(self.label.get(c, "")),
            c,
        ))[0]


# --- allergen assignment ---------------------------------------------------
def anchor_iris():
    return {a: {OBO + x for x in xs} for a, xs in ANCHORS.items()}


def closure_big9(fo: FoodOn, firi: str, anch) -> set:
    seen = fo.ancestors(firi)
    hits = {a for a, irs in anch.items() if seen & irs}
    if "tree nuts" in hits and (seen & anch["peanuts"]):
        hits.discard("tree nuts")
        hits.add("peanuts")
    return hits


def map_universe(fo: FoodOn, names_aliases):
    """name -> (foodon_id | None, method, big9 set)."""
    anch = anchor_iris()
    out = {}
    for name, aliases in names_aliases:
        firi, method = resolve_class(fo, name, aliases)
        big9 = closure_big9(fo, firi, anch) if firi else set()
        curated = ALLERGEN_ADD.get(name)
        if curated and curated[0]:
            added = curated[0] - big9
            big9 = big9 | curated[0]
            method = method + "+curated_allergen" if added else method
        out[name] = (firi, method, big9)
    return out


def resolve_class(fo: FoodOn, name: str, aliases):
    if name in FOODON_OVERRIDES:
        return OBO + FOODON_OVERRIDES[name], "curated_class"
    firi = fo.pick(name)
    if firi:
        return firi, "label_match"
    for alias in aliases:
        firi = fo.pick(alias)
        if firi:
            return firi, "alias_match"
    return None, "unmapped"


# --- output ----------------------------------------------------------------
def load_universe(repo: Path):
    rows = []
    with (repo / "data" / "ingredients.csv").open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            aliases = [a for a in row.get("aliases", "").split(";") if a.strip()]
            rows.append((row["name"], aliases))
    return rows


def big9_str(big9: set) -> str:
    return ";".join(a for a in BIG9_ORDER if a in big9)


def write_allergens(repo: Path, mapping) -> int:
    out_dir = repo / "data" / "foodon"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "allergens.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name", "foodon_id", "big9", "mapping_method"])
        for name, (firi, method, big9) in mapping.items():
            w.writerow([name, short(firi) if firi else "", big9_str(big9), method])
    return len(mapping)


def sync_ingredients_big9(repo: Path, mapping) -> None:
    """Mirror the closure's Big-9 flags into ingredients.csv big9_flags.

    allergens.csv stays the source of truth; this keeps the placeholder column
    in the universe CSV in sync on every re-run (rows/columns are otherwise
    preserved verbatim, so a re-run is a no-op once synced)."""
    path = repo / "data" / "ingredients.csv"
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        rows = list(reader)
    for row in rows:
        _firi, _method, big9 = mapping[row["name"]]
        row["big9_flags"] = big9_str(big9)
    # preserve the hand-authored file's LF line endings (csv defaults to CRLF)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


# --- report ----------------------------------------------------------------
def report(fo: FoodOn, mapping) -> None:
    anch = anchor_iris()
    print("== anchor class labels (verify present) ==")
    for a in BIG9_ORDER:
        for iri in ANCHORS[a]:
            print(f"  {a:22s} {iri:16s} {fo.label.get(OBO + iri, '<<MISSING>>')}")
    print("\n== per-ingredient mapping ==")
    unmapped = []
    for name, (firi, method, big9) in mapping.items():
        b = ";".join(a for a in BIG9_ORDER if a in big9) or "-"
        lab = fo.label.get(firi, "") if firi else ""
        if firi is None:
            unmapped.append(name)
        print(f"  {name:22s} {short(firi) if firi else 'UNMAPPED':18s} {b:26s} {method:24s} {lab}")
    print(f"\nunmapped ({len(unmapped)}): {', '.join(unmapped)}")


# --- main ------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--workdir", required=True, type=Path,
                    help="scratch dir for the raw OWL (never committed)")
    ap.add_argument("--repo", type=Path, default=Path("."),
                    help="repo root (containing data/ingredients.csv)")
    ap.add_argument("--report", action="store_true",
                    help="print the mapping report and exit (no files written)")
    args = ap.parse_args()

    owl_path = ensure_release(args.workdir)
    print(f"parsing {owl_path.name} ...", file=sys.stderr)
    fo = FoodOn.load(owl_path)
    print(f"  {len(fo.label)} labelled classes", file=sys.stderr)
    universe = load_universe(args.repo)
    mapping = map_universe(fo, universe)

    if args.report:
        report(fo, mapping)
        return

    n = write_allergens(args.repo, mapping)
    sync_ingredients_big9(args.repo, mapping)
    n_allerg = sum(1 for _n, (_f, _m, b) in mapping.items() if b)
    n_unmapped = sum(1 for _n, (f, _m, _b) in mapping.items() if f is None)
    print(f"wrote {n} rows to {args.repo / 'data' / 'foodon' / 'allergens.csv'} "
          f"({n_allerg} carry a Big-9 allergen; {n_unmapped} unmapped); "
          f"synced ingredients.csv big9_flags")


if __name__ == "__main__":
    main()
