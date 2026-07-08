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

**What:** Continuous-motion GIFs of four end-to-end scenes for the README
walkthrough — desktop 1440×1000, LIGHT theme:

| scene | file | shows |
|---|---|---|
| `loop` | `docs/media/01-develop-loop.gif` | seed → proposal at the pass → accept → the versioned trial record |
| `safety` | `docs/media/02-safety-hold.gif` | a garlic-oil steer trips the safety gate; ask-for-changes recovers to Trial 2 |
| `restart` | `docs/media/03-restart-survival.gif` | kill + restart the server; the reconnect banner clears and a deep-link reload rebuilds state from SQLite |
| `postcook` | `docs/media/04-post-cook-rework.gif` | I cooked this → tasting notes → post-cook rework proposal → accept |

**How:** `cd web && node tools/demo.mjs <loop|safety|restart|postcook|all> [outdir]`
(outdir defaults to `../docs/media`). Unlike `shots.mjs`, `demo.mjs` owns the whole
stub-server lifecycle itself — it spawns `bin/capycook` on **:8098** with a per-scene
fresh temp DB (`CAPYCOOK_STUB_LLM=1`), records, and tears the server down. Build
`bin/capycook` first (`make build-all`, so the current UI is embedded). Needs
`ffmpeg` on PATH for the GIF encode (downscale 960px, 7 fps, ~0.3–0.6 MB each).

**Notes:**
- Frames are captured via CDP `Page.startScreencast` (renderer-pushed), sampled to
  disk at a fixed interval — a blocking `Page.captureScreenshot` on the same renderer
  deadlocks the automation's `evaluate`/`waitFor` commands, screencast does not.
- The `restart` scene hard-kills (`SIGKILL`) the server so the SSE connection drops
  at once and the "Reconnecting" banner fires; a graceful `SIGTERM` drains the
  long-lived stream and the drop never surfaces.
- Server cleanup is by the spawned child handle, and a stale listener is freed by
  **port :8098 only** — never a broad `pkill` (the user's :8099 prototype shares the
  binary).

**Why vendored:** the convergence/demo loop recurs (5.4R reruns, 5.5 GIFs, future
redirect passes), so the scripts belong in-repo rather than in a scratch dir that
nearly got garbage-collected.
