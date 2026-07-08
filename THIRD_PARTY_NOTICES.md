# Third-Party Notices

CapyCook itself is licensed under the [MIT License](LICENSE). It bundles
third-party **data assets** and builds on third-party **software libraries**,
each under its own license. This file records their attributions and licenses.
It links to canonical license texts rather than vendoring them, except where a
license's own terms require the text to travel with the data (FlavorGraph's
Apache-2.0 copy ships at [`data/flavorgraph/LICENSE`](data/flavorgraph/LICENSE)).

Per-asset provenance — exact upstream artifact URLs, release dates, and SHA256
pins — lives in each asset's `PROVENANCE.md` under [`data/`](data/); this file
is the license/attribution summary.

## Vendored data assets

These ship inside the repository (and, baked read-only at `/srv/data`, inside
the Docker image) as universe-bounded subsets under `data/`.

| Asset | Shipped as | License | Attribution |
|---|---|---|---|
| **USDA FoodData Central** — per-100 g nutrient panels + household portion weights | [`data/usda/`](data/usda/) | **CC0 1.0** (public domain; U.S. Government work) | U.S. Department of Agriculture, Agricultural Research Service, Beltsville Human Nutrition Research Center. *FoodData Central.* <https://fdc.nal.usda.gov/> |
| **FoodOn** — FDA Big-9 allergen closure | [`data/foodon/`](data/foodon/) | **CC BY 4.0** | Dooley DM, Griffiths EJ, Gosal GS, et al. *FoodOn: a harmonized food ontology to increase global food traceability, quality control and data integration.* npj Science of Food 2, 23 (2018). <https://foodon.org> · <https://github.com/FoodOntology/foodon> |
| **FlavorGraph** — pre-trained node embeddings (pairing signal) | [`data/flavorgraph/`](data/flavorgraph/) | **Apache-2.0** (license text at [`data/flavorgraph/LICENSE`](data/flavorgraph/LICENSE)) | Park D, Kim K, Kim S, Spranger M, Kang J. *FlavorGraph: a large-scale food-chemical graph for generating food representations and recommending food pairings.* Scientific Reports 11 (2021). <https://github.com/lamypark/FlavorGraph> |
| **BLS Average Price Data** — retail price series (cost table) | [`data/cost/prices.csv`](data/cost/prices.csv) | **Public domain** (U.S. Government work) | U.S. Bureau of Labor Statistics, Average Price Data (AP). <https://www.bls.gov/> |
| **USDA ERS Fruit & Vegetable Prices** — retail price estimates (cost table) | [`data/cost/prices.csv`](data/cost/prices.csv) | **Public domain** (U.S. Government work) | U.S. Department of Agriculture, Economic Research Service. <https://www.ers.usda.gov/data-products/fruit-and-vegetable-prices>. *Findings should not be attributed to Circana, whose 2023 scanner data underlies the ERS estimates.* |
| **USDA FSIS** safe minimum internal temperatures + **CDC** botulism guidance — cited, hand-authored safety rules (not vendored verbatim) | [`data/safety/`](data/safety/) | **Public domain** (U.S. Government work) | USDA Food Safety and Inspection Service, *Safe Minimum Internal Temperature Chart*; U.S. Centers for Disease Control and Prevention, botulism prevention pages. Per-rule citations in [`data/safety/PROVENANCE.md`](data/safety/PROVENANCE.md). |

**CC BY 4.0 (FoodOn) attribution requirement:** the table above and
`data/foodon/PROVENANCE.md` provide the required credit, the CC BY 4.0 license
link (<https://creativecommons.org/licenses/by/4.0/>), and an indication that
the shipped file is a derived subset (the Big-9 closure), not the full ontology.

**Cost-table honesty note:** the cost table is `[approximate]` by design and is
**not** USDA-nutrition-attributed. Beyond the two official public-domain series
above, ~166 of its 246 rows are explicit builder-judgment estimates (tagged
per-row in the `source` column), not measurements — see
[`data/cost/PROVENANCE.md`](data/cost/PROVENANCE.md).

### Not bundled in this release

- **KitcheNette** (Apache-2.0; Park et al., 2019 — <https://github.com/dmis-lab/KitcheNette>)
  is listed as an optional pairing-score signal in the design
  ([`DESIGN.md`](DESIGN.md) §10), but **is not vendored or shipped in v0**:
  FlavorGraph is the only pairing signal in this build. It is recorded here for
  completeness; no KitcheNette attribution obligation arises because none of its
  data or code is distributed. If a future release vendors it, add its
  Apache-2.0 attribution to the table above.

## Software dependencies

### Go modules (direct)

The compiled server links these. Full dependency licenses (including transitive)
are resolvable from `go.mod` / `go.sum`.

| Module | License |
|---|---|
| [`github.com/sashabaranov/go-openai`](https://github.com/sashabaranov/go-openai) — OpenAI-compatible client (base-URL → DeepSeek) | Apache-2.0 |
| [`go.opentelemetry.io/otel`](https://github.com/open-telemetry/opentelemetry-go) (+ `otel/sdk`, `otel/trace`, `exporters/otlp/otlptrace/otlptracehttp`) — tracing → OTLP/HTTP → Langfuse | Apache-2.0 |
| [`modernc.org/sqlite`](https://gitlab.com/cznic/sqlite) — pure-Go SQLite (no CGO) | BSD-3-Clause |

The Go standard library (`net/http`, `log/slog`, …) is under the Go project's
BSD-3-Clause license.

### npm packages (direct)

The frontend is built with these, then compiled to static assets embedded in
the Go binary. **`react` and `react-dom` are the only runtime-shipped packages**
(bundled into the served SPA); the rest are build-, test-, or capture-time
tooling that is not distributed in the runtime image.

| Package | License | Role |
|---|---|---|
| `react`, `react-dom` | MIT | shipped in the SPA bundle |
| `@types/react`, `@types/react-dom` | MIT | build (types) |
| `typescript` | Apache-2.0 | build |
| `vite`, `@vitejs/plugin-react` | MIT | build |
| `tailwindcss`, `postcss`, `autoprefixer` | MIT | build (CSS) |
| `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom` | MIT | test only |
| `puppeteer-core` | Apache-2.0 | dev capture tooling (`web/tools/`) only |

## Runtime services (not distributed with CapyCook)

These are contacted only when you configure them; no code or weights are bundled.

- **DeepSeek** — the hosted model API called when `DEEPSEEK_API_KEY` is set
  (the demo calls the hosted API, not the weights). DeepSeek's open-weight
  models are MIT-licensed; CapyCook ships neither weights nor the API client's
  server.
- **Langfuse** — optional trace backend (Langfuse Cloud, or the self-host
  `langfuse` profile in [`docker-compose.yml`](docker-compose.yml)). Langfuse's
  core is MIT-licensed and self-hostable. The `langfuse` compose profile pulls
  the upstream published images (`langfuse/langfuse`, `langfuse/langfuse-worker`,
  `clickhouse/clickhouse-server`, `postgres`, `redis`, `minio`) at run time,
  each under its own license from its registry; CapyCook redistributes none of
  them.

---

*Licenses were verified against the vendored license files and each package's
declared license as of 2026-07-07. If you spot an inaccuracy, please open an
issue.*
