// Stub-server lifecycle for the oracle — adapted from tools/demo.mjs (the
// proven rig). One server per scenario, always on a fresh temp DB, always in
// stub mode. Port hygiene rules carry over verbatim: stale listeners are freed
// by PORT only (lsof -ti), never a broad pkill — the user's :8099 prototype
// shares the bin/capycook binary and must never be touched.
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const BIN = join(REPO, 'bin', 'capycook');

// Profile → server env. live-nokey is BC-H-6's carve-out: the live-status
// branch is unreachable under the stub flag, so it runs with the flag unset
// and a dummy key — that scenario submits no move, so zero spend holds.
export const PROFILES = {
  'fast':       { CAPYCOOK_STUB_LLM: '1', DEEPSEEK_API_KEY: '' },
  'live-sim':   { CAPYCOOK_STUB_LLM: '1', DEEPSEEK_API_KEY: '', CAPYCOOK_STUB_LATENCY_MS: '25000' },
  'budget':     { CAPYCOOK_STUB_LLM: '1', DEEPSEEK_API_KEY: '', LLM_BUDGET_USD: '0' },
  'live-nokey': { CAPYCOOK_STUB_LLM: '', DEEPSEEK_API_KEY: 'oracle-dummy-key-never-called' },
};

export const LIVE_SIM_MS = 25000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function assertPortAllowed(port) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1024 || p > 65535) throw new Error(`oracle: bad port ${port}`);
  if (p === 8099) throw new Error('oracle: port 8099 is the user\'s prototype — refused');
  return p;
}

// Fresh temp DB path for a scenario. The under-tmpdir guard below is what
// makes BC-J-5 unviolatable by a typo, so every path flows through here.
export function tempDbPath(scenarioId, port) {
  const slug = scenarioId.replace(/[^a-z0-9-]/gi, '-');
  return join(tmpdir(), `capycook-oracle-${port}-${slug}.db`);
}

function assertTempDb(dbPath) {
  if (!resolve(dbPath).startsWith(resolve(tmpdir()))) {
    throw new Error(`oracle: refusing DB_PATH outside tmpdir: ${dbPath} (BC-J-5)`);
  }
}

// Remove a temp DB and every sidecar the server may have created next to it
// (SQLite -wal/-shm and the budget ledger).
export function removeTempDb(dbPath) {
  assertTempDb(dbPath);
  for (const suffix of ['', '-wal', '-shm', '.budget.json']) {
    rmSync(dbPath + suffix, { force: true });
  }
}

export function freeStalePort(port) {
  assertPortAllowed(port);
  spawnSync('bash', ['-c', `lsof -ti tcp:${port} | xargs kill -9 2>/dev/null`], { stdio: 'ignore' });
}

export function startServer({ port, dbPath, profile = 'fast', extraEnv = {} }) {
  assertPortAllowed(port);
  assertTempDb(dbPath);
  const profileEnv = PROFILES[profile];
  if (!profileEnv) throw new Error(`oracle: unknown profile ${profile}`);
  return spawn(BIN, [], {
    cwd: REPO,
    env: {
      ...process.env,
      PORT: String(port), DB_PATH: dbPath, DATA_DIR: './data',
      ...profileEnv,
      ...extraEnv,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}

export async function waitHealthz(base, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const r = await fetch(`${base}/healthz`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('oracle: server never became healthy on ' + base);
}

// SIGTERM = graceful teardown. SIGKILL is REQUIRED for any scenario asserting
// on an SSE drop (BC-H-2/H-3, BC-D-5's drop half): a graceful shutdown drains
// the long-lived stream inside the server's 10s Shutdown window and the
// browser's EventSource never sees the drop.
export function stopServer(child, signal = 'SIGTERM') {
  return new Promise((res) => {
    if (!child || child.exitCode !== null) return res();
    child.once('exit', () => res());
    child.kill(signal);
    if (signal !== 'SIGKILL') {
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } }, 3000);
    }
  });
}

// A scenario-scoped server handle: spawn/await-healthy/restart/kill, tracked
// so the runner can always clean up (port-scoped) even after a crash.
export class ServerHandle {
  constructor({ port, scenarioId, profile, extraEnv }) {
    this.port = assertPortAllowed(port);
    this.base = `http://localhost:${this.port}`;
    this.scenarioId = scenarioId;
    this.profile = profile;
    this.extraEnv = extraEnv || {};
    this.dbPath = tempDbPath(scenarioId, this.port);
    this.child = null;
  }
  async start({ profile = this.profile, extraEnv = this.extraEnv, freshDb = false } = {}) {
    if (this.child) await this.stop();
    if (freshDb) removeTempDb(this.dbPath);
    freeStalePort(this.port);
    this.child = startServer({ port: this.port, dbPath: this.dbPath, profile, extraEnv });
    await waitHealthz(this.base);
    return this;
  }
  // The setupFast trick: pre-seed state at zero latency, then flip the server
  // to the scenario's real profile on the SAME temp DB (committed state
  // persists — BC-D-5's own guarantee). Callers must count lifetime POSTs
  // from the page NetLog, never from server history.
  async restart({ profile = this.profile, extraEnv = this.extraEnv, signal = 'SIGTERM' } = {}) {
    await this.stop(signal);
    freeStalePort(this.port);
    this.child = startServer({ port: this.port, dbPath: this.dbPath, profile, extraEnv });
    await waitHealthz(this.base);
  }
  async stop(signal = 'SIGTERM') {
    const c = this.child;
    this.child = null;
    await stopServer(c, signal);
  }
  async dispose() {
    await this.stop();
    freeStalePort(this.port);
    removeTempDb(this.dbPath);
  }
}
