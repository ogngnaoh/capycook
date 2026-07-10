// Demo-GIF capture: drives the redesigned CapyCook loop headlessly, snaps
// frames on a fixed interval while the automation runs, and encodes each
// scene to a GIF with ffmpeg. Unlike tools/shots.mjs (discrete evidence
// stills), this records continuous motion for the README walkthrough.
//
// Usage:  node tools/demo.mjs <scene|all> [outdir]
//   scenes: loop safety restart postcook branch dial cancel technical
//   Capture 1440x1000, downscaled to 800px / 15fps (S7 media constraints:
//   <=15s, 640-800px, 15fps, <5MB). Output GIFs default to ../docs/media/.
//   Requires the puppeteer-core devDep, system Chrome at the macOS default
//   path, and ffmpeg on PATH. Build bin/capycook first (make build-all).
//
// Scene 01 (loop) films the whole journey from the intake form; every other
// scene pre-builds its dish + trials over the HTTP API before recording
// starts, so each GIF opens on the workbench state it is about and stays
// inside the <=15s budget. The cancel scene starts its server with
// CAPYCOOK_STUB_LATENCY_MS so the proposing state is on screen long enough
// to stop; the technical scene records in the dark theme.
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
const CAP_MS = 66; // ~15fps capture cadence
const FPS = 15;
const WIDTH = 800; // downscale target (S7 constraint: 640-800px wide)

// Setup scenes open their pre-built dish BEFORE the recorder starts
// (preroll): the GIF then opens directly on the workbench — no white-flash
// initial paint, which both replays on every loop and costs a full frame
// of GIF data (full-frame changes dominate file size; see encodeGif).
const SCENES = {
  loop: { file: '01-develop-loop.gif', run: sceneLoop },
  safety: { file: '02-safety-hold.gif', run: sceneSafety, setup: seedTrials(1), preroll: openTrial(1) },
  restart: { file: '03-restart-survival.gif', run: sceneRestart, setup: seedTrials(1), preroll: openTrial(1) },
  postcook: { file: '04-post-cook-rework.gif', run: scenePostcook, setup: seedTrials(1), preroll: openTrial(1) },
  branch: { file: '05-branch-promote.gif', run: sceneBranch, setup: seedTrials(2), preroll: openTrial(2) },
  // The dial defaults ON — the dial scene's dish starts OFF so the scene
  // can flip it on camera.
  dial: { file: '06-autonomy-dial.gif', run: sceneDial, setup: seedTrials(1, { autonomy_dial: false }), preroll: openTrial(1) },
  cancel: {
    file: '07-midstream-cancel.gif', run: sceneCancel, setup: seedTrials(1), preroll: openTrial(1),
    env: { CAPYCOOK_STUB_LATENCY_MS: '3000' },
  },
  technical: { file: '08-technical-dark.gif', run: sceneTechnical, setup: seedTrials(1), preroll: openTrial(1), theme: 'dark' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const log = (...a) => console.error(`[+${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
mkdirSync(OUTDIR, { recursive: true });

// ------------------------------------------------------------- page helpers ---
// (Selector vocabulary follows tools/shots.mjs — the up-to-date reference for
// the redesigned UI: data-verb hooks where they exist, ^-anchored text
// regexes elsewhere, never $-anchored on verb buttons, which carry a trailing
// aria-hidden keyboard-shortcut glyph.)
const clickButton = (page, re) => page.evaluate((src, flags) => {
  const rx = new RegExp(src, flags);
  const btn = [...document.querySelectorAll('button')].find((b) => rx.test(b.textContent.trim()));
  if (!btn) throw new Error(`no button matching ${src}`);
  btn.click();
}, re.source, re.flags);

const waitForText = (page, text, timeout = 25000) =>
  page.waitForFunction((t) => document.body.textContent.includes(t), { timeout }, text);

const clickVerb = (page, verb) => page.evaluate((v) => {
  const btn = document.querySelector(`button[data-verb="${v}"]`);
  if (!btn) throw new Error(`no button[data-verb="${v}"]`);
  btn.click();
}, verb);

const waitForVerb = (page, verb, timeout = 25000) =>
  page.waitForSelector(`button[data-verb="${verb}"]`, { timeout });

// Wait for a REAL (committed) trial card in the timeline spine — committed
// trials are <button>s; the synthetic pending node is a <div> (see
// tools/shots.mjs for why a bare waitForText false-positives here).
const waitForTimelineTrial = (page, n, timeout = 25000) => page.waitForFunction((num) => {
  const aside = document.querySelector('aside[aria-label="Development timeline"]');
  if (!aside) return false;
  return [...aside.querySelectorAll('button')].some((b) => b.textContent.trim().startsWith(`Trial ${num}`));
}, { timeout }, n);

const clickTimelineTrial = (page, n) => page.evaluate((num) => {
  const aside = document.querySelector('aside[aria-label="Development timeline"]');
  const btn = aside && [...aside.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(`Trial ${num}`));
  if (!btn) throw new Error(`no Trial ${num} card`);
  btn.click();
}, n);

const SEED_TEXT = 'a cozy one-pan roast chicken dinner with root vegetables';

// Fill the seed intake form with visible keystrokes (the typing IS the
// motion in GIF 01): the free-text seed, two Big-9 allergen chips (plain
// toggle buttons), and the three placeholder-anchored free-list inputs.
async function fillSeed(page) {
  await page.type('#field-seed', SEED_TEXT, { delay: 14 });
  for (const allergen of ['peanuts', 'crustacean shellfish']) {
    await page.evaluate((a) => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === a);
      if (!btn) throw new Error(`no allergen chip ${a}`);
      btn.click();
    }, allergen);
    await sleep(100);
  }
  await page.type('input[placeholder="vegetarian, low sodium"]', 'low sodium', { delay: 10 });
  await page.type('input[placeholder="cast iron, oven"]', 'cast iron, oven', { delay: 10 });
  await page.type('input[placeholder="thyme, lemons"]', 'thyme, lemons', { delay: 10 });
}

// Seed -> workbench with an accepted Trial 1, all on camera. Scene 01 only —
// every other scene pre-builds this state over the API instead.
async function seedToTrial1(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  log('  seed page loaded');
  await settle(600);
  await fillSeed(page);
  await settle(400);
  await clickButton(page, /^Develop this dish/i);
  await page.waitForFunction(() => location.pathname.startsWith('/dishes/'), { timeout: 8000 });
  await page.waitForSelector('#cc-intent', { timeout: 8000 });
  log('  workbench ready');
  await settle(800);
  await page.type('#cc-intent', 'make it richer and more herb-forward', { delay: 14 });
  await settle(300);
  await clickButton(page, /^Try it/i);
  await waitForVerb(page, 'accept');
  log('  proposal at the pass');
  await settle(1300);
  await clickVerb(page, 'accept');
  await waitForTimelineTrial(page, 1);
  log('  Trial 1 accepted');
  await settle(900);
}

// Open a pre-built dish straight on the workbench and wait for the Trial-n
// card — the preroll for every setup scene, run before recording starts.
function openTrial(n) {
  return async (page, ctx) => {
    await page.goto(`${BASE}/dishes/${ctx.dishId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#cc-intent', { timeout: 8000 });
    await waitForTimelineTrial(page, n);
  };
}

// ----------------------------------------------------------- API pre-setup ---
// seedTrials(n) creates a dish and accepts n proposals (Trial 1..n) over the
// pinned HTTP API before the recorder starts — the same requests the UI
// makes, so the opening frame is a real workbench state, not a mock.
const CONSTRAINTS = {
  dietary: ['low sodium'], allergens: ['peanuts', 'crustacean shellfish'],
  equipment: ['cast iron', 'oven'], skill: 'intermediate', servings: 2,
  on_hand: ['thyme', 'lemons'], cuisine: 'western',
};
const SETUP_MOVES = [
  { moveType: 'seed_expand', steer: '' },
  { moveType: 'flavor_direction', steer: 'lean it smoky-sweet' },
];

async function api(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'demo-rig' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${await r.text()}`);
  return r.json();
}

async function waitForPending(dishId, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const d = await api('GET', `/api/dishes/${dishId}`);
    if (d.state === 'awaiting_gate') {
      const p = (d.pendingProposals && d.pendingProposals[0]) || d.pendingProposal;
      if (p) return p;
    }
    if (d.state === 'blocked') throw new Error('setup move blocked unexpectedly');
    await sleep(150);
  }
  throw new Error('setup move never reached the gate');
}

function seedTrials(n, dishExtra = {}) {
  return async () => {
    const dish = await api('POST', '/api/dishes', { seed: SEED_TEXT, constraints: CONSTRAINTS, ...dishExtra });
    for (let i = 0; i < n; i++) {
      await api('POST', `/api/dishes/${dish.id}/move`, SETUP_MOVES[i]);
      const prop = await waitForPending(dish.id);
      await api('POST', `/api/dishes/${dish.id}/gate`, { proposalId: prop.id, verb: 'accept' });
    }
    return dish.id;
  };
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

function startServer(dbPath, extraEnv = {}) {
  const child = spawn(BIN, [], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT, DB_PATH: dbPath, DATA_DIR: './data',
      CAPYCOOK_STUB_LLM: '1', DEEPSEEK_API_KEY: '',
      ...extraEnv,
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
// (01) the whole loop on camera: seed intake -> proposal at the pass ->
// accept -> the versioned trial record (snapshot + back).
async function sceneLoop(page) {
  await seedToTrial1(page);
  await clickTimelineTrial(page, 1);
  await waitForText(page, 'Viewing a past trial');
  await settle(1500);
  await clickButton(page, /^Back to current$/i);
  await settle(800);
}

// (02) garlic-oil steer trips the deterministic safety hold; "Ask for a
// safer change" recovers to Trial 2.
async function sceneSafety(page) {
  await settle(800);
  await page.type('#cc-intent', 'infuse some garlic oil for richness', { delay: 14 });
  await settle(400);
  await clickButton(page, /^Try it/i);
  await waitForText(page, 'Safety hold');
  await settle(1900); // read the blocked evidence + anchored rule
  await clickVerb(page, 'redirect');
  await page.waitForSelector('#safety-hold-steer', { timeout: 8000 });
  await settle(500);
  await page.type('#safety-hold-steer', 'use a lemon-herb pan sauce instead', { delay: 14 });
  await settle(400);
  await clickButton(page, /^Send$/i);
  await waitForVerb(page, 'accept');
  await settle(1400); // the recovered proposal at the pass
  await clickVerb(page, 'accept');
  await waitForTimelineTrial(page, 2);
  await settle(1300);
}

// (03) kill + restart the server mid-flow: the reconnect banner shows and clears
// on its own, then a deep-link reload rebuilds the exact state from SQLite.
async function sceneRestart(page, ctx) {
  await settle(800);

  // Hard-kill the backend -> the persistent EventSource drops at once ->
  // "Reconnecting — your draft is safe." banner appears.
  await stopServer(ctx.server, 'SIGKILL');
  ctx.server = null;
  await waitForText(page, 'Reconnecting', 8000);
  await settle(2200);

  // Bring the backend back on the SAME db file; the browser auto-reconnects
  // (STREAM_RETRY_MS = 2s) and the banner clears + re-syncs via GET.
  ctx.server = startServer(ctx.dbPath, ctx.env);
  await waitHealthz();
  await page.waitForFunction(() => !document.querySelector('[data-testid="reconnect-banner"]'), { timeout: 12000 }).catch(() => {});
  await settle(1500);

  // Deep-link reload: a cold boot rebuilds Trial 1 + the draft from persistence.
  // Wait on domcontentloaded, not networkidle0 — the dish page holds a persistent
  // EventSource open, so the network never goes fully idle; the render is proven
  // by the timeline-trial wait that follows. The scene ends here, on the
  // rebuilt workbench — that IS the persistence proof.
  await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
  await waitForTimelineTrial(page, 1);
  await settle(2200);
}

// (04) I cooked this -> tasting notes -> rework proposal -> accept.
async function scenePostcook(page) {
  await settle(800);
  await clickButton(page, /^I cooked this/i);
  await page.waitForSelector('#cc-tasting-notes', { timeout: 8000 });
  await settle(400);
  await page.type('#cc-tasting-notes',
    'carrots needed ten more minutes and the sauce was thin — thicken it', { delay: 12 });
  await settle(800);
  await clickButton(page, /^Rework from these notes/i);
  await waitForVerb(page, 'accept');
  await settle(1500); // the rework proposal at the pass
  await clickVerb(page, 'accept');
  await waitForTimelineTrial(page, 2);
  await settle(1300); // Trial 1 carries its Cooked badge + note
}

// (05) branch + promote: view the Trial-1 snapshot, promote it to trunk,
// develop off it — the new trial carries the Branch badge (two lines of
// development now share Trial 1 as parent).
async function sceneBranch(page) {
  await settle(1100); // the line of development: two trials on the trunk
  await clickTimelineTrial(page, 1);
  await waitForText(page, 'Viewing a past trial');
  await settle(1400); // read the read-only snapshot
  // Trial 1 is the only earlier non-current node, so the first (and only)
  // promote control on screen is its.
  await clickButton(page, /^Promote to trunk$/i);
  await waitForText(page, 'promoted to service');
  await settle(1100);
  await page.type('#cc-intent', 'try a brighter, citrus-forward finish', { delay: 14 });
  await settle(300);
  await clickButton(page, /^Try it/i);
  await waitForVerb(page, 'accept');
  await settle(1100);
  await clickVerb(page, 'accept');
  await waitForTimelineTrial(page, 3);
  await settle(1800); // Trial 3 carries the Branch badge
}

// (06) autonomy dial: deterministic math fast-forwards with no gate;
// a creative move still parks at the gate.
async function sceneDial(page) {
  await settle(900);
  await clickButton(page, /^Auto-apply safe steps$/i);
  await settle(900); // deterministic chips pick up their 'auto' tags
  await clickButton(page, /^Recompute cost/i);
  await waitForText(page, 'applied automatically');
  await waitForTimelineTrial(page, 2);
  await settle(1600); // Trial 2 landed with no gate — the toast says why
  await page.type('#cc-intent', 'add a crunchy element', { delay: 14 });
  await settle(300);
  await clickButton(page, /^Try it/i);
  await waitForVerb(page, 'accept');
  await settle(2200); // creative move still needs your call
}

// (07) mid-stream cancel: with CAPYCOOK_STUB_LATENCY_MS the proposing card
// (spinner + Stop) is on screen long enough to stop; a second try left
// alone runs to the gate.
async function sceneCancel(page) {
  await settle(700);
  await page.type('#cc-intent', 'reimagine it as a hands-off traybake', { delay: 14 });
  await settle(300);
  await clickButton(page, /^Try it/i);
  await page.waitForSelector('[data-testid="proposing-card"]', { timeout: 8000 });
  await settle(1700); // the kitchen is thinking — spinner, caret, Stop
  await clickButton(page, /^Stop$/);
  await page.waitForFunction(() => !document.querySelector('[data-testid="proposing-card"]'), { timeout: 8000 });
  await settle(1300); // cancelled: bench back to Ready, nothing stored
  await page.type('#cc-intent', 'add a crunchy element', { delay: 14 });
  await settle(200);
  await clickButton(page, /^Try it/i);
  await waitForVerb(page, 'accept'); // left alone, the same wait completes
  await settle(1500);
}

// (08) technical view + dark mode: slugs, ver ids and raw values surface;
// the diff at the gate in the dark theme.
async function sceneTechnical(page) {
  await settle(900);
  await clickButton(page, /^Technical view/i);
  await settle(1300); // ver ids + slugs surface across the workbench
  await page.type('#cc-intent', 'swap the chicken for king oyster mushrooms', { delay: 14 });
  await settle(300);
  await clickButton(page, /^Try it/i);
  await waitForVerb(page, 'accept');
  await settle(1900); // the diff at the gate, technical + dark
  await clickVerb(page, 'accept');
  await waitForTimelineTrial(page, 2);
  await settle(1200);
}

// ------------------------------------------------------------------ encode ---
// dither=none: the UI is flat panels + text, so dithering is pure noise —
// it breaks LZW runs and triples the cost of full-frame changes (banner
// shifts, reloads), which dominate file size. gifsicle -O3 stays LOSSLESS:
// --lossy leaves visible ghosting on the dark theme's flat background.
function encodeGif(framesDir, outPath) {
  const vf = `scale=${WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];`
    + `[b][p]paletteuse=dither=none`;
  const r = spawnSync('ffmpeg', [
    '-y', '-framerate', String(FPS),
    '-i', join(framesDir, 'frame-%05d.png'),
    '-vf', vf, outPath,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error('ffmpeg failed:\n' + (r.stderr || '').toString().slice(-1800));
  const g = spawnSync('gifsicle', ['-O3', outPath, '-o', outPath], { stdio: 'ignore' });
  if (g.error || g.status !== 0) log('  (gifsicle unavailable or failed — raw ffmpeg encode kept)');
}

// -------------------------------------------------------------------- driver ---
async function captureScene(key) {
  const { file, run, setup, preroll, theme = 'light', env = {} } = SCENES[key];
  const framesDir = join(tmpdir(), `capycook-demo-${key}`);
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  const dbPath = join(tmpdir(), `capycook-demo-${key}.db`);
  rmSync(dbPath, { recursive: true, force: true });

  freeStalePort();
  const ctx = { dbPath, env, server: startServer(dbPath, env), dishId: null };
  await waitHealthz();
  log(`${key}: server healthy`);
  if (setup) {
    ctx.dishId = await setup(ctx);
    log(`${key}: setup done, dish ${ctx.dishId}`);
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-first-run', `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
  });
  log(`${key}: browser up`);
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.evaluateOnNewDocument((t) => localStorage.setItem('capycook-theme', t), theme);
    if (preroll) {
      await preroll(page, ctx);
      log(`${key}: preroll done (opening state ready off camera)`);
    }

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
    console.log(`${key}: ${rec.n} frames -> ${file} (${mb} MB, ${(rec.n / FPS).toFixed(1)}s)`);
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
