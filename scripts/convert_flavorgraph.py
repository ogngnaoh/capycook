#!/usr/bin/env python3
"""Vendor FlavorGraph node embeddings for the CapyCook ingredient universe.

Downloads the pre-trained 300-D FlavorGraph node embeddings (the pickle the
upstream README links for download), the node-id -> name table, and the
upstream Apache-2.0 LICENSE, all pinned to one upstream commit; verifies every
artifact's SHA256; matches the ingredient nodes against the CapyCook universe
(``data/ingredients.csv``); and writes the committed subset:

  data/flavorgraph/embeddings.csv  — name, node_id, fg_name, v0..v299
  data/flavorgraph/LICENSE         — upstream Apache-2.0 text (travels with data)

The raw ~10 MB pickle and the full node table stay in ``--workdir`` (scratch)
and are NEVER committed; only the universe-bounded subset above lands in the
repo. Provenance (repo URL, commit SHA, artifact SHA256s, matching method,
unmatched items) is recorded in ``data/flavorgraph/PROVENANCE.md`` and
enforced by this script's pinned hashes.

Deliberate restriction (documented for Gate A): only nodes matched to the
universe are vendored, so every pairing suggestion the grounding layer emits
is resolvable (USDA/FoodOn) and costable. FlavorGraph's remaining ~6,400
ingredient nodes are dropped, not renamed.

Upstream staleness note: FlavorGraph (Park et al. 2021) last moved in 2022 and
its data is a 2019/2020-era snapshot. Per DESIGN.md this is expected — the
embeddings are a frozen research artifact, pinned here by commit + SHA256.

Dependencies: Python 3.9+ standard library plus **numpy** (the pickle stores
numpy float32 arrays; unpickling imports numpy). Ran with the system
Python 3.11.5 + numpy 2.4.2. If your python lacks numpy, use a venv:

    python3 -m venv /tmp/fg-venv
    /tmp/fg-venv/bin/pip install numpy
    /tmp/fg-venv/bin/python scripts/convert_flavorgraph.py --workdir <scratch>

Usage:
    python3 scripts/convert_flavorgraph.py --workdir /path/to/scratch [--repo .]

Re-runnable: reproduces embeddings.csv byte-for-byte from the pinned
artifacts (already-downloaded artifacts are reused when their hash matches;
any hash mismatch aborts before writing).

Matching (deterministic, mirrors the Go resolver's normalization)
-----------------------------------------------------------------
  Tier 0 — curated override: OVERRIDES[name] names the FlavorGraph node
      directly (used where no name/alias form matches; every pick is listed
      in PROVENANCE.md with its basis).
  Tier 1 — normalized exact match of the canonical name, then each alias in
      order, against FlavorGraph ingredient-node names. normalize = lowercase,
      non-alphanumerics to space, naive-singularize each token (same rule as
      vendor_usda.py / vendor_foodon.py / the Go resolver). No qualifier
      stripping here: FlavorGraph carries separate fresh_/dried_/ground_
      nodes, and stripping would collide them. Ambiguous buckets (several
      nodes normalizing alike) are resolved deterministically — shortest raw
      node name, then lexicographic name, then smallest node id — and
      reported; the 2026-07-07 run hit no ambiguous bucket.
  Unmatched — listed in the report and in PROVENANCE.md; the ingredient
      simply gets no pairing suggestions (it still resolves via USDA/FoodOn).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import pickle
import re
import sys
import urllib.request
from pathlib import Path

# --- pinned upstream -------------------------------------------------------
# Repo: https://github.com/lamypark/FlavorGraph  (Apache-2.0)
# Commit: tip of master, verified via the GitHub API on 2026-07-07.
REPO_URL = "https://github.com/lamypark/FlavorGraph"
COMMIT = "8d3472d0823f4542b2ce47f83e28046c41d2f06a"  # 2022-07-07 "Update README.md"
RAW = f"https://raw.githubusercontent.com/lamypark/FlavorGraph/{COMMIT}"

# The pre-trained embedding pickle is linked from the README at the pinned
# commit ("Pickle file containing the 300D FlavorGraph node embeddings"). It
# is hosted on Google Drive, not in git, so the SHA256 below — not the URL —
# is the authoritative pin; a changed upload aborts the run.
ARTIFACTS = {
    "embeddings": {
        "url": ("https://drive.google.com/uc?export=download"
                "&id=1MN2dGr-e8x09XSfj0kG4MahTRFY8GDw4"),
        "filename": "FlavorGraph Node Embedding.pickle",  # Content-Disposition name
        "local": "flavorgraph_node_embedding.pickle",
        "sha256": "36671d66942931f3af436c35db7cab21ecfc0b913ec0654804f3ff3eb9051bb9",
    },
    "nodes": {
        "url": f"{RAW}/input/nodes_191120.csv",
        "local": "nodes_191120.csv",
        "sha256": "ea59d1858ae3a41de14aeabda32e6274693ea7897eb6ae1a3b7262bac5526d5a",
    },
    "license": {
        "url": f"{RAW}/LICENSE",
        "local": "LICENSE",
        "sha256": "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
    },
}

DIM = 300

# --- curated universe-name -> FlavorGraph-node overrides (tier 0) ----------
# Used only where no canonical/alias form matches a node. Same-food picks:
# the fillet/cracked form is the graph's only node for that ingredient.
OVERRIDES = {
    "tilapia": "tilapia_fillet",  # node 6416 — only tilapia node in the graph
    "farro": "cracked_farro",     # node 1655 — only farro node in the graph
}


# --- normalization (shared rule with vendor_usda.py / the Go resolver) ------
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


# --- download + verify ------------------------------------------------------
def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_artifact(key: str, workdir: Path) -> Path:
    art = ARTIFACTS[key]
    path = workdir / art["local"]
    if not path.exists():
        print(f"downloading {key}: {art['url']}")
        urllib.request.urlretrieve(art["url"], path)
    got = sha256_of(path)
    if got != art["sha256"]:
        sys.exit(
            f"FATAL: {key} SHA256 mismatch for {path}\n"
            f"  want {art['sha256']}\n  got  {got}\n"
            "The upstream artifact changed (or the download was cut short). "
            "Re-verify provenance before re-pinning."
        )
    return path


# --- main -------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--workdir", required=True, type=Path,
                    help="scratch dir for the raw artifacts (never committed)")
    ap.add_argument("--repo", default=".", type=Path,
                    help="repo root (default: cwd)")
    args = ap.parse_args()
    args.workdir.mkdir(parents=True, exist_ok=True)

    emb_path = ensure_artifact("embeddings", args.workdir)
    nodes_path = ensure_artifact("nodes", args.workdir)
    license_path = ensure_artifact("license", args.workdir)

    try:
        import numpy  # noqa: F401 — needed by pickle.load; see module docstring
    except ImportError:
        sys.exit("FATAL: numpy is required to unpickle the embeddings "
                 "(see the venv recipe in this script's docstring).")

    # pickle.load is safe here only because ensure_artifact() has already
    # verified the file against the pinned SHA256 above — we execute nothing
    # that was not hash-reviewed. Upstream ships pickle only; no JSON exists.
    with emb_path.open("rb") as f:
        embeddings = pickle.load(f)  # dict: node_id str -> np.ndarray(300, float32)

    # ingredient nodes only (the graph also holds chemical-compound nodes)
    buckets: dict[str, list[tuple[str, int]]] = {}
    fg_by_name: dict[str, int] = {}
    with nodes_path.open(newline="") as f:
        for row in csv.DictReader(f):
            if row["node_type"] != "ingredient":
                continue
            name, node_id = row["name"], int(row["node_id"])
            fg_by_name[name] = node_id
            buckets.setdefault(normalize(name), []).append((name, node_id))

    universe = list(csv.DictReader(
        (args.repo / "data" / "ingredients.csv").open(newline="")))

    matched: list[tuple[str, int, str, str]] = []  # (name, node_id, fg_name, method)
    unmatched: list[str] = []
    ambiguous: list[str] = []
    for row in universe:
        name = row["name"]
        if name in OVERRIDES:
            fg_name = OVERRIDES[name]
            if fg_name not in fg_by_name:
                sys.exit(f"FATAL: override {name!r} -> {fg_name!r}: no such node")
            matched.append((name, fg_by_name[fg_name], fg_name, "curated_override"))
            continue
        forms = [(name, "name_match")] + [
            (a, "alias_match") for a in row["aliases"].split(";") if a]
        for form, method in forms:
            bucket = buckets.get(normalize(form))
            if not bucket:
                continue
            if len(bucket) > 1:
                ambiguous.append(f"{name} via {form!r}: {sorted(bucket)}")
            fg_name, node_id = min(
                bucket, key=lambda c: (len(c[0]), c[0], c[1]))
            matched.append((name, node_id, fg_name, method))
            break
        else:
            unmatched.append(name)

    missing_vec = [m[0] for m in matched if str(m[1]) not in embeddings]
    if missing_vec:
        sys.exit(f"FATAL: matched nodes lack embeddings: {missing_vec}")

    outdir = args.repo / "data" / "flavorgraph"
    outdir.mkdir(parents=True, exist_ok=True)
    out_csv = outdir / "embeddings.csv"
    with out_csv.open("w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["name", "node_id", "fg_name"] + [f"v{i}" for i in range(DIM)])
        for name, node_id, fg_name, _ in sorted(matched):
            vec = embeddings[str(node_id)]
            if vec.shape != (DIM,):
                sys.exit(f"FATAL: node {node_id} has shape {vec.shape}, want ({DIM},)")
            # 9 significant digits round-trips float32 exactly (Go ParseFloat(s, 32))
            w.writerow([name, node_id, fg_name]
                       + [format(float(v), ".9g") for v in vec])

    (outdir / "LICENSE").write_bytes(license_path.read_bytes())

    methods: dict[str, int] = {}
    for _, _, _, method in matched:
        methods[method] = methods.get(method, 0) + 1
    print(f"universe: {len(universe)}  matched: {len(matched)}  "
          f"unmatched: {len(unmatched)}")
    print(f"methods: {methods}")
    print(f"unmatched items: {unmatched or '(none)'}")
    if ambiguous:
        print("ambiguous buckets (deterministically resolved):")
        for a in ambiguous:
            print(f"  {a}")
    print(f"wrote {out_csv} ({out_csv.stat().st_size} bytes) and {outdir/'LICENSE'}")


if __name__ == "__main__":
    main()
