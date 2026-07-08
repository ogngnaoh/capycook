// Demo-GIF capture (plan 5.5): drives the redesigned CapyCook loop headlessly in
// the LIGHT theme, snaps frames on a fixed interval while the automation runs,
// and encodes each scene to a GIF with ffmpeg. Unlike tools/shots.mjs (discrete
// evidence stills), this records continuous motion for the README walkthrough.
//
// Usage:  node tools/demo.mjs <loop|safety|restart|postcook|all> [outdir]
//   Desktop 1440x1000, stub server on :8098 with a per-scene fresh temp DB.
//   Output GIFs default to ../docs/media/. Requires the puppeteer-core devDep,
//   system Chrome at the macOS default path, and ffmpeg on PATH.
//
// The script owns the stub server's whole lifecycle (spawn -> capture -> kill),
// so it never needs pkill: it kills the child it spawned by handle, and frees a
// stale :8098 listener by port only — the user's :8099 prototype is never touched.
import puppeteer from 'puppeteer-core';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCENE = process.argv[2] || 'all';
const OUTDIR = resolve(process.argv[3] || '../docs/media');
const REPO = resolve('..'); // node runs from web/; the repo root is one up
const BIN = join(REPO, 'bin', 'capycook');
const PORT = '8098';
const BASE = `http://localhost:${PORT}`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORT = { width: 1440, height: 1000 };
const CAP_MS = 140; // ~7fps capture cadence
const FPS = 7;
const WIDTH = 960; // downscale target (keeps GIFs under the ~8MB budget)

const SCENES = {
  loop: { file: '01-develop-loop.gif', run: sceneLoop },
  safety: { file: '02-safety-hold.gif', run: sceneSafety },
  restart: { file: '03-restart-survival.gif', run: sceneRestart },
  postcook: { file: '04-post-cook-rework.gif', run: scenePostcook },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const log = (...a) => console.error(`[+${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
mkdirSync(OUTDIR, { recursive: true });

// ------------------------------------------------------------- page helpers ---
// (Deliberately a self-contained copy of the tools/shots.mjs helpers so the
// converged evidence tool stays untouched; the selectors are the shared UI.)
const clickButton = (page, re) => page.evaluate((src, flags) => {
  const rx = new RegExp(src, flags);
  const btn = [...document.querySelectorAll('button')].find((b) => rx.test(b.textContent.trim()));
  if (!btn) throw new Error(`no button matching ${src}`);
  btn.click();
}, re.source, re.flags);

const waitForButton = (page, re, timeout = 25000) => page.waitForFunction((src, flags) => {
  const rx = new RegExp(src, flags);
  return [...document.querySelectorAll('button')].some((b) => rx.test(b.textContent.trim()));
}, { timeout }, re.source, re.flags);

const waitForText = (page, text, timeout = 25000) =>
  page.waitForFunction((t) => document.body.textContent.includes(t), { timeout }, text);

// Fill the seed intake form (mirrors shots.mjs fillSeed; small keystroke delay
// so the typing reads as motion in the GIF).
async function fillSeed(page) {
  await page.type('textarea', 'a cozy one-pan roast chicken dinner with root vegetables', { delay: 18 });
  for (const allergen of ['peanuts', 'crustacean shellfish']) {
    await page.evaluate((a) => {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === a);
      if (!label) throw new Error(`no allergen chip ${a}`);
      label.click();
    }, allergen);
    await sleep(120);
  }
  const textInputs = await page.$$('input:not([type="checkbox"]):not([type="number"])');
  await textInputs[0].type('low sodium', { delay: 12 });
  await textInputs[1].type('cast iron, oven', { delay: 12 });
  await textInputs[2].type('thyme, lemons', { delay: 12 });
}

// Seed -> workbench with an accepted Trial 1. Shared spine of every scene.
async function seedToTrial1(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  log('  seed page loaded');
  await settle(700);
  await fillSeed(page);
  await settle(500);
  await clickButton(page, /^start dish$/i);
  await page.waitForFunction(() => location.pathname.startsWith('/dishes/'), { timeout: 8000 });
  await waitForText(page, 'bench is clear');
  log('  workbench (bench clear)');
  await settle(900);
  await clickButton(page, /^propose a move$/i);
  await waitForButton(page, /^accept$/i);
  log('  proposal at the pass');
  await settle(1300); // read the proposed recipe at the pass
  await clickButton(page, /^accept$/i);
  await waitForText(page, 'Trial 1');
  log('  Trial 1 accepted');
  await settle(1000);
}

// ---------------------------------------------------------------- recorder ---
// Continuous capture via CDP Page.startScreencast: the renderer PUSHES frames
// as events, so nothing ever serializes behind — and deadlocks — the
// automation's evaluate/type/waitFor commands (a blocking Page.captureScreenshot
// on the same renderer does exactly that). A fixed-interval sampler then writes
// the latest received frame to disk every CAP_MS, so idle "settle" pauses still
// dwell (the last frame repeats) and motion is captured as it arrives.
class Recorder {
  constructor(page, dir) {
    this.page = page;
    this.dir = dir;
    this.n = 0;
    this.latest = null;
    this.running = false;
    this.done = null;
    this.client = null;
  }
  async start() {
    this.client = await this.page.target().createCDPSession();
    this.client.on('Page.screencastFrame', (frame) => {
      this.latest = Buffer.from(frame.data, 'base64');
      // Ack so the renderer keeps sending; ignore failures after stop/detach.
      this.client.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
    });
    await this.client.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    this.running = true;
    this.done = (async () => {
      while (this.running) {
        const t0 = Date.now();
        if (this.latest) {
          this.n += 1;
          writeFileSync(join(this.dir, `frame-${String(this.n).padStart(5, '0')}.png`), this.latest);
        }
        const rest = CAP_MS - (Date.now() - t0);
        if (rest > 0) await sleep(rest);
      }
    })();
  }
  async stop() {
    this.running = false;
    await this.done;
    try { await this.client.send('Page.stopScreencast'); } catch { /* already gone */ }
    try { await this.client.detach(); } catch { /* already gone */ }
  }
}

// settle keeps the reel rolling for `ms` with no page action (a readable pause
// on the current state). The recorder captures throughout.
const settle = (ms) => sleep(ms);

// ------------------------------------------------------------ server plumbing ---
function freeStalePort() {
  // Only ever frees :8098 by port — never a broad pkill. :8099 is untouched.
  spawnSync('bash', ['-c', `lsof -ti tcp:${PORT} | xargs kill -9 2>/dev/null`], { stdio: 'ignore' });
}

function startServer(dbPath) {
  const child = spawn(BIN, [], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT, DB_PATH: dbPath, DATA_DIR: './data',
      CAPYCOOK_STUB_LLM: '1', DEEPSEEK_API_KEY: '',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  return child;
}

async function waitHealthz(timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('server never became healthy on ' + BASE);
}

// stopServer ends the child and resolves once it exits. SIGTERM lets the server
// shut down gracefully (teardown); SIGKILL drops it abruptly — required for the
// restart scene, since a graceful shutdown drains the long-lived SSE connection
// (10s Shutdown timeout) and the browser's EventSource never sees the drop, so
// the "Reconnecting" banner never fires. A hard kill severs the socket at once.
function stopServer(child, signal = 'SIGTERM') {
  return new Promise((res) => {
    if (!child || child.exitCode !== null) return res();
    child.once('exit', () => res());
    child.kill(signal);
    if (signal !== 'SIGKILL') {
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } }, 3000);
    }
  });
}

// ------------------------------------------------------------------ scenes ---
// (1) seed -> propose -> accept -> the trial strip + versioned history.
async function sceneLoop(page) {
  await seedToTrial1(page);
  await clickButton(page, /^trials/i); // expand the versioned history
  await page.waitForSelector('[data-testid="version-history"]', { timeout: 8000 });
  await settle(1600);
  await clickButton(page, /^trials/i); // collapse back to the strip
  await settle(900);
}

// (2) garlic-oil steer trips the deterministic safety hold; ask-for-changes
// redirects to a safe move and recovers to Trial 2.
async function sceneSafety(page) {
  await seedToTrial1(page);
  await page.type('[data-testid="steering-pane"] textarea', 'infuse some garlic oil for richness', { delay: 16 });
  await settle(500);
  await clickButton(page, /^propose a move$/i);
  await waitForText(page, 'Safety hold');
  await settle(1900); // read the blocked evidence + anchored rule
  await clickButton(page, /^ask for changes/i);
  await page.waitForSelector('[data-testid="redirect-form"]', { timeout: 8000 });
  await settle(600);
  await page.type('[data-testid="redirect-form"] textarea', 'use a lemon-herb pan sauce instead', { delay: 16 });
  await settle(500);
  await clickButton(page, /^send$/i);
  await waitForButton(page, /^accept$/i);
  await settle(1500); // the recovered proposal at the pass
  await clickButton(page, /^accept$/i);
  await waitForText(page, 'Trial 2');
  await settle(1400);
}

// (3) kill + restart the server mid-flow: the reconnect banner shows and clears
// on its own, then a deep-link reload rebuilds the exact state from SQLite.
async function sceneRestart(page, ctx) {
  await seedToTrial1(page);
  const dishUrl = page.url();
  await settle(1000);

  // Hard-kill the backend -> the persistent EventSource drops at once ->
  // "Reconnecting — your draft is safe." banner appears.
  await stopServer(ctx.server, 'SIGKILL');
  ctx.server = null;
  await waitForText(page, 'Reconnecting', 8000);
  await settle(2600);

  // Bring the backend back on the SAME db file; the browser auto-reconnects
  // (STREAM_RETRY_MS = 2s) and the banner clears + re-syncs via GET.
  ctx.server = startServer(ctx.dbPath);
  await waitHealthz();
  await page.waitForFunction(() => !document.querySelector('[data-testid="reconnect-banner"]'), { timeout: 12000 }).catch(() => {});
  await settle(1800);

  // Deep-link reload: a cold boot rebuilds Trial 1 + the draft from persistence.
  // Wait on domcontentloaded, not networkidle0 — the dish page holds a persistent
  // EventSource open, so the network never goes fully idle; the render is proven
  // by the Trial-1 text wait that follows.
  await page.goto(dishUrl, { waitUntil: 'domcontentloaded' });
  await waitForText(page, 'Trial 1');
  await settle(1200);
  await clickButton(page, /^trials/i);
  await page.waitForSelector('[data-testid="version-history"]', { timeout: 8000 });
  await settle(1600);
}

// (4) I cooked this -> tasting notes -> post-cook rework proposal -> accept.
async function scenePostcook(page) {
  await seedToTrial1(page);
  await clickButton(page, /^i cooked this$/i);
  await page.waitForSelector('[data-testid="cook-feedback-form"]', { timeout: 8000 });
  await waitForText(page, 'Tasting notes');
  await settle(500);
  await page.type('[data-testid="cook-feedback-form"] textarea',
    'carrots needed ten more minutes and the sauce was thin — thicken it', { delay: 14 });
  await settle(900);
  await clickButton(page, /^propose a rework$/i);
  await waitForButton(page, /^accept$/i);
  await settle(1600); // the rework proposal at the pass
  await clickButton(page, /^accept$/i);
  await waitForText(page, 'Bench ready');
  await settle(1400);
}

// ------------------------------------------------------------------ encode ---
function encodeGif(framesDir, outPath) {
  const vf = `scale=${WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];`
    + `[b][p]paletteuse=dither=bayer:bayer_scale=3`;
  const r = spawnSync('ffmpeg', [
    '-y', '-framerate', String(FPS),
    '-i', join(framesDir, 'frame-%05d.png'),
    '-vf', vf, outPath,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error('ffmpeg failed:\n' + (r.stderr || '').toString().slice(-1800));
}

// -------------------------------------------------------------------- driver ---
async function captureScene(key) {
  const { file, run } = SCENES[key];
  const framesDir = join(tmpdir(), `capycook-demo-${key}`);
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  const dbPath = join(tmpdir(), `capycook-demo-${key}.db`);
  rmSync(dbPath, { recursive: true, force: true });

  freeStalePort();
  const ctx = { dbPath, server: startServer(dbPath) };
  await waitHealthz();
  log(`${key}: server healthy`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-first-run', `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
  });
  log(`${key}: browser up`);
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.evaluateOnNewDocument(() => localStorage.setItem('capycook-theme', 'light'));

    const rec = new Recorder(page, framesDir);
    await rec.start();
    log(`${key}: recording -> ${framesDir}`);
    try {
      await run(page, ctx);
    } finally {
      await rec.stop();
    }
    log(`${key}: scene done, ${rec.n} frames; encoding`);
    const out = join(OUTDIR, file);
    encodeGif(framesDir, out);
    const mb = (statSync(out).size / 1024 / 1024).toFixed(2);
    console.log(`${key}: ${rec.n} frames -> ${file} (${mb} MB)`);
  } catch (err) {
    try { await (await browser.pages())[0].screenshot({ path: join(framesDir, 'ZZ-failure.png') }); } catch { /* best effort */ }
    console.error(`${key} FAILED:`, err.message);
    throw err;
  } finally {
    await browser.close();
    await stopServer(ctx.server);
  }
}

const order = SCENE === 'all' ? Object.keys(SCENES) : [SCENE];
for (const key of order) {
  if (!SCENES[key]) {
    console.error(`unknown scene ${key}; pick one of ${Object.keys(SCENES).join(', ')} or all`);
    process.exit(2);
  }
  await captureScene(key);
}
console.log('done', SCENE);
