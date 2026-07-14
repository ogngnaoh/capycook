// Read-only parser over the ratified contract (docs/archive/02b-behavior-contract/
// contract.md). Two consumers: the judge manifest embeds each judge
// criterion's VERBATIM text (judges get zero repo context), and `oracle.mjs
// list` cross-checks the registry against the document in both directions —
// a dropped or invented id fails loudly at Stage 0, not at census.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './server.mjs';

let cache = null;

export function parseContract() {
  if (cache) return cache;
  const src = readFileSync(join(REPO, 'docs/archive/02b-behavior-contract/contract.md'), 'utf8');
  // Criterion blocks: "**BC-<area>-<n>** · assert|judge · <statement...>" up to
  // the next criterion header or section break. The appendix references ids
  // in prose; only bold headers start a block.
  const entries = new Map();
  const re = /\*\*(BC-[A-J]-\d+)\*\*\s*·\s*(assert|judge)\s*·\s*/g;
  const matches = [...src.matchAll(re)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : src.indexOf('\n---', start);
    let block = src.slice(start, end === -1 ? undefined : end).trim();
    // Trim trailing section headers that fall inside the last block of a section.
    block = block.replace(/\n## .*$/s, '').trim();
    entries.set(m[1], { id: m[1], tag: m[2], text: block });
  }
  cache = entries;
  return entries;
}

export function contractText(id) {
  const e = parseContract().get(id);
  if (!e) throw new Error(`oracle: ${id} not found in contract.md`);
  return e.text;
}

export function contractIds() {
  return [...parseContract().keys()];
}
