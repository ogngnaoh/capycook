// Network observation and fault injection — deliberately two separate
// mechanisms:
//  - NetLog is PASSIVE (page event listeners): no interception, no cache
//    disable, zero perturbation. Every "exactly one POST" count in the
//    contract reads from here, and only from here — server history is
//    polluted by API pre-seeding.
//  - faultInjector uses setRequestInterception, which disables the cache and
//    touches every request including the persistent EventSource. It is
//    enabled only in fault scenarios and must continue() everything it does
//    not target.
export class NetLog {
  constructor(page) {
    this.entries = [];
    page.on('request', (req) => {
      this.entries.push({
        t: Date.now(), kind: 'request',
        method: req.method(), url: req.url(), path: new URL(req.url()).pathname,
        postData: req.method() === 'POST' || req.method() === 'PATCH' ? req.postData() : undefined,
      });
    });
    page.on('response', (res) => {
      this.entries.push({
        t: Date.now(), kind: 'response',
        method: res.request().method(), url: res.url(),
        path: new URL(res.url()).pathname, status: res.status(),
      });
    });
    page.on('requestfailed', (req) => {
      this.entries.push({
        t: Date.now(), kind: 'failed',
        method: req.method(), url: req.url(), path: new URL(req.url()).pathname,
        error: req.failure() ? req.failure().errorText : null,
      });
    });
  }
  mark() { return this.entries.length; }
  // Count requests (not responses) matching method + path regex since a mark.
  count({ method, pathRe, since = 0 }) {
    return this.entries.slice(since).filter((e) =>
      e.kind === 'request'
      && (!method || e.method === method)
      && (!pathRe || pathRe.test(e.path))).length;
  }
  slice(since = 0) { return this.entries.slice(since); }
}

// rules: [{ method, pathRe, action: 'abort' | 'delay', ms, times }]
// times (optional) limits how many matches a rule consumes; a rule with
// times exhausted stops matching. Everything unmatched is continued
// untouched — including the SSE stream.
export async function installFaultInjector(page, rules) {
  const state = rules.map((r) => ({ ...r, used: 0 }));
  await page.setRequestInterception(true);
  const handler = async (req) => {
    const rule = state.find((r) =>
      (!r.method || req.method() === r.method)
      && r.pathRe.test(new URL(req.url()).pathname)
      && (r.times === undefined || r.used < r.times));
    if (!rule) return req.continue().catch(() => {});
    rule.used += 1;
    if (rule.action === 'abort') return req.abort('connectionrefused').catch(() => {});
    if (rule.action === 'delay') {
      await new Promise((r) => setTimeout(r, rule.ms || 1500));
      return req.continue().catch(() => {});
    }
    return req.continue().catch(() => {});
  };
  page.on('request', handler);
  return async function removeFaults() {
    page.off('request', handler);
    await page.setRequestInterception(false).catch(() => {});
  };
}
