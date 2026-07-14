// Criterion-evaluation micro-framework. Each scenario declares its criteria
// up front and evaluates them inline via ctx.check(id, fn); this module
// enforces the bookkeeping BC-J-7 depends on: an undeclared check throws, a
// declared-but-never-evaluated criterion becomes an explicit harness-error
// row, and a journey-critical failure marks everything downstream of it
// 'blocked' — explicit rows, never silent skips.
import { byId } from '../registry.mjs';

const DEADLINES = { 'fast': 30000, 'live-sim': 90000, 'budget': 30000, 'live-nokey': 30000 };

export class JourneyAbort extends Error {
  constructor(criterionId) {
    super(`journey-critical check failed: ${criterionId}`);
    this.criterionId = criterionId;
  }
}

class CheckT {
  constructor() {
    this.expectations = [];   // {label, pass, observed, expected}
    this.observations = {};   // free-form recorded values
    this.attachments = [];    // {name, data} extra evidence (json-able)
  }
  expect(cond, label, detail = {}) {
    this.expectations.push({ label, pass: !!cond, ...detail });
    return !!cond;
  }
  expectEq(observed, expected, label) {
    return this.expect(Object.is(observed, expected) || JSON.stringify(observed) === JSON.stringify(expected),
      label, { observed, expected });
  }
  expectMatch(str, re, label) {
    return this.expect(typeof str === 'string' && re.test(str), label, { observed: str, expected: String(re) });
  }
  observe(key, value) { this.observations[key] = value; }
  attach(name, data) { this.attachments.push({ name, data }); }
  get pass() { return this.expectations.length > 0 && this.expectations.every((e) => e.pass); }
}

export class ScenarioChecks {
  constructor({ scenario, profile, evidence, capture, contextInfo }) {
    this.scenario = scenario;           // { id, criteria: [...] }
    this.profile = profile;
    this.evidence = evidence;           // EvidenceSink
    this.capture = capture;             // async () => Buffer|null (non-blocking still)
    this.contextInfo = contextInfo;     // async () => {url, activeElement, consoleErrors, netTail}
    this.rows = [];
    this.evaluated = new Set();
    this.aborted = null;                // criterion id that aborted the journey
  }

  async check(id, fn, { name = 'main', deadlineMs, journeyCritical = false } = {}) {
    if (!this.scenario.criteria.includes(id)) {
      throw new Error(`oracle: ${this.scenario.id} evaluated undeclared criterion ${id}`);
    }
    if (!byId.has(id)) throw new Error(`oracle: unknown criterion ${id}`);
    const t = new CheckT();
    const startedAt = Date.now();
    const deadline = deadlineMs ?? DEADLINES[this.profile] ?? 30000;
    let failureKind = null;
    let error = null;
    try {
      await Promise.race([
        fn(t),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`check deadline ${deadline}ms exceeded`)), deadline)),
      ]);
      if (t.expectations.length === 0) {
        failureKind = 'harness-error';
        error = 'check body made no expectations';
      } else if (!t.pass) {
        failureKind = 'assert';
      }
    } catch (e) {
      failureKind = /deadline .* exceeded/.test(String(e && e.message)) ? 'timeout' : 'error';
      error = String((e && e.stack) || e).slice(0, 2000);
    }
    const pass = failureKind === null;
    const ms = Date.now() - startedAt;
    this.evaluated.add(id);

    const evidencePaths = [];
    try {
      const shotBuf = await this.capture();
      if (shotBuf) {
        evidencePaths.push(this.evidence.write(this.scenario.id, id, `${name}-${pass ? 'pass' : 'fail'}.png`, shotBuf));
      }
      if (!pass) {
        const info = this.contextInfo ? await this.contextInfo().catch(() => null) : null;
        evidencePaths.push(this.evidence.write(this.scenario.id, id, `${name}-detail.json`, {
          criterion: id, subCheck: name, scenario: this.scenario.id, profile: this.profile,
          failureKind, error,
          expectations: t.expectations, observations: t.observations,
          attachments: t.attachments, context: info,
        }));
      } else if (t.attachments.length) {
        evidencePaths.push(this.evidence.write(this.scenario.id, id, `${name}-data.json`, t.attachments));
      }
    } catch (e) {
      evidencePaths.push(`(evidence capture failed: ${String(e).slice(0, 120)})`);
    }

    this.rows.push({
      id, subCheck: name, scenario: this.scenario.id, profile: this.profile,
      pass, failureKind, error,
      expectations: t.expectations, observations: t.observations,
      evidence: evidencePaths, ms, startedAt: new Date(startedAt).toISOString(),
    });

    if (!pass && journeyCritical) {
      this.aborted = id;
      throw new JourneyAbort(id);
    }
    return pass;
  }

  // Called by the runner after run() returns or aborts: every declared
  // criterion must have ≥1 row. Missing ones become explicit failures —
  // 'blocked' when a journey-critical check failed upstream, otherwise
  // 'harness-error' (the scenario forgot it).
  finalize() {
    for (const id of this.scenario.criteria) {
      if (this.evaluated.has(id)) continue;
      // Judge criteria are satisfied by captured evidence (judgeStill /
      // sampleScreencast), not by check() calls — their report rows come
      // from the judge manifest.
      if (byId.get(id)?.tag === 'judge') continue;
      this.rows.push({
        id, subCheck: 'main', scenario: this.scenario.id, profile: this.profile,
        pass: false,
        failureKind: this.aborted ? 'blocked' : 'harness-error',
        error: this.aborted
          ? `upstream journey-critical failure: ${this.aborted}`
          : 'declared but never evaluated by the scenario body',
        expectations: [], observations: {}, evidence: [], ms: 0,
        startedAt: new Date().toISOString(),
      });
    }
    return this.rows;
  }
}
