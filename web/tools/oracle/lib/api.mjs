// HTTP-API pre-seeding — adapted from tools/demo.mjs. Scenarios use this to
// pre-build dish state (dishes, trials) over the pinned API before the page
// attaches, so journeys open on the state they're about. All requests carry
// an oracle session id; the server records them as ordinary requests against
// the scenario's TEMP db — never the operator DB.
import { SEED_TEXT } from './page.mjs';

export const CONSTRAINTS = {
  dietary: ['low sodium'], allergens: ['peanuts', 'crustacean shellfish'],
  equipment: ['cast iron', 'oven'], skill: 'intermediate', servings: 2,
  on_hand: ['thyme', 'lemons'], cuisine: 'western',
};

export const SETUP_MOVES = [
  { moveType: 'seed_expand', steer: '' },
  { moveType: 'flavor_direction', steer: 'lean it smoky-sweet' },
  { moveType: 'ingredient_swap', steer: 'swap in something seasonal' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeApi(base) {
  return async function api(method, path, body) {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'oracle-rig' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${await r.text()}`);
    return r.json();
  };
}

export async function waitForPending(api, dishId, timeout = 30000) {
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

// Create a dish and accept n proposals (Trial 1..n). Returns the dish id.
// Run this against a ZERO-LATENCY server (the setupFast trick) — never pay
// the live-sim window for setup moves.
export function seedTrials(n, dishExtra = {}) {
  return async ({ api }) => {
    const dish = await api('POST', '/api/dishes', { seed: SEED_TEXT, constraints: CONSTRAINTS, ...dishExtra });
    for (let i = 0; i < n; i++) {
      await api('POST', `/api/dishes/${dish.id}/move`, SETUP_MOVES[i % SETUP_MOVES.length]);
      const prop = await waitForPending(api, dish.id);
      await api('POST', `/api/dishes/${dish.id}/gate`, { proposalId: prop.id, verb: 'accept' });
    }
    return dish.id;
  };
}
