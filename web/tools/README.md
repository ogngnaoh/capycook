# tools/shots.mjs

**What:** Headless-Chrome capture of the Gate-C evidence set — drives the full redesigned dish loop and screenshots each state, both themes, desktop (01..19) and narrow (N1..N5, with a horizontal-overflow report).

**How:** Build the SPA (`make web`) and run a stub-mode server, then `cd web && node tools/shots.mjs <light|dark> <outdir> [--narrow]` (defaults to `http://localhost:8098`; override with `CAPYCOOK_BASE`). Needs the `puppeteer-core` devDependency and system Chrome at the macOS default path.

**Why vendored:** the convergence loop recurs (5.4R reruns, 5.5 GIFs, future redirect passes), so the script belongs in-repo rather than in a scratch dir that nearly got garbage-collected.
