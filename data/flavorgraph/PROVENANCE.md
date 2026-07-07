# data/flavorgraph/ — provenance

Pre-trained **FlavorGraph node embeddings**, subset to the CapyCook ingredient
universe (`data/ingredients.csv`). Produced by `scripts/convert_flavorgraph.py`
(re-runnable; Python 3.9+ with numpy — run 2026-07-07 used the system
Python 3.11.5 + numpy 2.4.2; a venv recipe is in the script header), which
downloads the pinned artifacts into a scratch directory, verifies each SHA256,
matches FlavorGraph's ingredient nodes against the universe, and writes only
the universe-bounded subset below. The raw ~10 MB pickle and the full node
table are never committed.

The Go grounding layer (`internal/grounding/flavorgraph.go`) reads only
`embeddings.csv`: it unit-normalizes the vectors at load and serves top-10
pairing suggestions by cosine similarity (dot product of normalized vectors).

## Pinned upstream

| item | value |
|---|---|
| project | FlavorGraph (Park et al. 2021) |
| repo | <https://github.com/lamypark/FlavorGraph> |
| commit | `8d3472d0823f4542b2ce47f83e28046c41d2f06a` (tip of `master`, 2022-07-07 "Update README.md"; verified via the GitHub API 2026-07-07) |
| license | Apache License 2.0 (repo `LICENSE` at the pinned commit; also stated in its README) |

Paper (citation block quoted from the README at the pinned commit):
Park, Donghyeon; Kim, Keonwoo; Kim, Seoyoon; Spranger, Michael; Kang, Jaewoo.
*FlavorGraph: a large-scale food-chemical graph for generating food
representations and recommending food pairings.* Scientific Reports 11 (2021),
pp. 1–13. Nature Publishing Group.

**Staleness note (expected):** the upstream project last moved in 2022 and its
graph is a 2019/2020-era research snapshot (node table `nodes_191120.csv`,
i.e. 2019-11-20). Per `DESIGN.md` this is deliberate — the embeddings are a
frozen research artifact used as a deterministic pairing signal, pinned here
by commit + SHA256, not a live data feed.

## Pinned raw artifacts (downloaded + hashed 2026-07-07)

| artifact | source | SHA256 |
|---|---|---|
| `FlavorGraph Node Embedding.pickle` (10,552,153 bytes) — dict of node-id → 300-D float32 numpy array, 8,297 nodes | Google Drive id `1MN2dGr-e8x09XSfj0kG4MahTRFY8GDw4` (download URL `https://drive.google.com/uc?export=download&id=1MN2dGr-e8x09XSfj0kG4MahTRFY8GDw4`) | `36671d66942931f3af436c35db7cab21ecfc0b913ec0654804f3ff3eb9051bb9` |
| `input/nodes_191120.csv` (343,416 bytes) — node-id → name/type table, 8,298 nodes (6,653 ingredient + 1,645 compound) | <https://raw.githubusercontent.com/lamypark/FlavorGraph/8d3472d0823f4542b2ce47f83e28046c41d2f06a/input/nodes_191120.csv> | `ea59d1858ae3a41de14aeabda32e6274693ea7897eb6ae1a3b7262bac5526d5a` |
| `LICENSE` (Apache-2.0 text) | <https://raw.githubusercontent.com/lamypark/FlavorGraph/8d3472d0823f4542b2ce47f83e28046c41d2f06a/LICENSE> | `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |

**Google Drive caveat:** the embedding pickle is the artifact the upstream
README (at the pinned commit) links as "Pickle file containing the 300D
FlavorGraph node embeddings"; it is hosted on Google Drive, not in git, so it
cannot be commit-pinned. The SHA256 above is therefore the authoritative pin:
`convert_flavorgraph.py` refuses to run against a file whose hash differs.
The filename is the upload's own `Content-Disposition` name.

## Files

### embeddings.csv — universe-subset node embeddings (246 rows, 2026-07-07 run)

One row per universe ingredient: `name, node_id, fg_name, v0..v299`, sorted by
`name`. `name` is the canonical universe name; `node_id`/`fg_name` are the
matched FlavorGraph node. `v0..v299` are the node's raw upstream float32
embedding values, printed with 9 significant digits (exact float32
round-trip); vectors are **not** normalized here — the Go loader
unit-normalizes. Re-running the script reproduces the file byte-for-byte
(verified: two consecutive runs, identical SHA256).

### LICENSE — upstream Apache-2.0 text

Byte-identical copy of the repo `LICENSE` at the pinned commit: the license
travels with the vendored data.

## Deliberate universe restriction (Gate A design decision)

Only the 246 nodes matched to the ingredient universe are vendored; the
remaining ~6,400 FlavorGraph ingredient nodes are dropped. Pairing suggestions
are therefore restricted to the universe **by construction**, so every
suggestion the model sees is resolvable (USDA/FoodOn ids), allergen-checkable,
and costable. The trade-off — no novel out-of-pantry suggestions — is
accepted for v0: an unresolvable suggestion could not be safety-screened or
priced.

## Ingredient → node matching (deterministic)

Same normalization as `vendor_usda.py` / `vendor_foodon.py` / the Go resolver:
lowercase, non-alphanumerics → space, naive-singularize each token. No
qualifier stripping — FlavorGraph carries separate `fresh_`/`dried_`/`ground_`
nodes and stripping would collide them. Match tiers, with 2026-07-07 counts:

1. **Curated override** (`curated_override`, 2): hand-picked node where no
   name/alias form matches. Same-food picks — the chosen node is the graph's
   only node for that ingredient: tilapia → `tilapia_fillet` (node 6416);
   farro → `cracked_farro` (node 1655).
2. **Canonical name match** (`name_match`, 237): normalized exact match of
   the universe name against ingredient-node names.
3. **Alias match** (`alias_match`, 7): the same match over the ingredient's
   aliases, in listed order: bbq sauce → `barbecue_sauce` (316); beef chuck
   roast → `chuck_roast` (1349); cheddar → `cheddar_cheese` (1083);
   mozzarella → `mozzarella_cheese` (4309); parmesan → `parmesan_cheese`
   (4615); pesto → `basil_pesto` (333); ricotta → `ricotta_cheese` (5454).

Ambiguous normalized buckets are resolved deterministically (shortest raw
node name, then lexicographic, then smallest node id) and reported by the
script; the 2026-07-07 run hit **no** ambiguous bucket.

**Unmatched universe items: none** (246/246 matched).
