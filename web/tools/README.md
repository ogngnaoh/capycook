# web/tools — headless capture

Two headless-Chrome capture scripts. Both drive the real, redesigned dish loop in
stub-LLM mode against a fresh database and need the `puppeteer-core` devDependency
plus system Chrome at the macOS default path.

## shots.mjs — evidence stills

**What:** Discrete-state screenshots of the Gate-C evidence set — drives the full
loop and screenshots each state, both themes, desktop (01..19) and narrow (N1..N5,
with a horizontal-overflow report).

**How:** Build the SPA (`make web`) and run a stub-mode server, then
`cd web && node tools/shots.mjs <light|dark> <outdir> [--narrow]` (defaults to
`http://localhost:8098`; override with `CAPYCOOK_BASE`).

## demo.mjs — README demo GIFs

**What:** Continuous-motion GIFs of eight scenes for the README walkthrough —
desktop 1440×1000, LIGHT theme (except `technical`, which records DARK):

| scene | file | shows |
|---|---|---|
| `loop` | `docs/media/01-develop-loop.gif` | seed → proposal at the pass → accept → the versioned trial record |
| `safety` | `docs/media/02-safety-hold.gif` | a garlic-oil steer trips the safety gate; ask-for-a-safer-change recovers to Trial 2 |
| `restart` | `docs/media/03-restart-survival.gif` | kill + restart the server; the reconnect banner clears and a deep-link reload rebuilds state from SQLite |
| `postcook` | `docs/media/04-post-cook-rework.gif` | I cooked this → tasting notes → rework proposal → accept (Cooked badge on Trial 1) |
| `branch` | `docs/media/05-branch-promote.gif` | view a past trial → Promote to trunk → develop off it → Branch badge |
| `dial` | `docs/media/06-autonomy-dial.gif` | dial on → deterministic recompute auto-applies (no gate) → creative move still gates |
| `cancel` | `docs/media/07-midstream-cancel.gif` | Stop mid-generation → nothing stored → the retry runs to the gate |
| `technical` | `docs/media/08-technical-dark.gif` | technical view + dark theme: fdc/foodon ids, ver hashes, raw slugs |

**How:** `cd web && node tools/demo.mjs <scene|all> [outdir]`
(outdir defaults to `../docs/media`). Unlike `shots.mjs`, `demo.mjs` owns the whole
stub-server lifecycle itself — it spawns `bin/capycook` on **:8098** with a per-scene
fresh temp DB (`CAPYCOOK_STUB_LLM=1`), records, and tears the server down. Build
`bin/capycook` first (`make build-all`, so the current UI is embedded). Needs
`ffmpeg` on PATH for the GIF encode (downscale 800px, 15 fps — the S7 media
constraints — ~0.1–0.4 MB each); `gifsicle` is optional (lossless `-O3` post-pass).

**Notes:**
- Frames are captured via CDP `Page.startScreencast` (renderer-pushed), sampled to
  disk at a fixed interval — a blocking `Page.captureScreenshot` on the same renderer
  deadlocks the automation's `evaluate`/`waitFor` commands, screencast does not.
- Scene `loop` films the whole journey from the intake form; every other scene
  pre-builds its dish + trials over the HTTP API and opens the workbench **before**
  recording starts (preroll) — the GIF opens on the state the scene is about, and
  the initial paint (a full-frame change that replays on every loop) never costs
  GIF bytes.
- Full-frame changes dominate GIF size, and dithering makes them ~3× worse — the
  encode uses `paletteuse=dither=none` (the UI is flat panels; dithering is pure
  noise here). Keep gifsicle LOSSLESS: `--lossy` leaves visible ghosting on the
  dark theme.
- The `cancel` scene starts its server with `CAPYCOOK_STUB_LATENCY_MS=3000` (the
  demo-capture knob in `internal/llm/stub.go`) so the proposing card is on screen
  long enough to stop; the `dial` scene creates its dish with `autonomy_dial: false`
  because the dial defaults ON.
- The `restart` scene hard-kills (`SIGKILL`) the server so the SSE connection drops
  at once and the "Reconnecting" banner fires; a graceful `SIGTERM` drains the
  long-lived stream and the drop never surfaces.
- Server cleanup is by the spawned child handle, and a stale listener is freed by
  **port :8098 only** — never a broad `pkill` (the user's :8099 prototype shares the
  binary).

**Why vendored:** the convergence/demo loop recurs (5.4R reruns, 5.5 GIFs, future
redirect passes), so the scripts belong in-repo rather than in a scratch dir that
nearly got garbage-collected.
