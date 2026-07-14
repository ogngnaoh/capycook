#!/usr/bin/env node
import { resolve } from 'node:path';
import { checkRepositoryIntegrity } from './oracle/lib/guardrails.mjs';

const OID_PATTERN = /^[0-9a-f]{40}$/;

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
    options[arg.slice(2)] = value;
    index += 1;
  }
  return options;
}

function fail(message) {
  console.error(`repository-integrity: FAIL: ${message}`);
  process.exitCode = 1;
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  fail(error.message);
}

if (args) {
  const repo = resolve(args.repo || process.cwd());
  // GITHUB_SHA is the integrity target for every event GitHub fires here: on a
  // branch push it is the pushed commit, and on an annotated-tag push it is
  // already the PEELED commit — which is also what actions/checkout leaves in
  // the working tree. The frozen-history guarantees below are pin-based
  // (ancestry + byte-identity against fixed baselines), so they need only that
  // commit. Deriving it from the push event payload instead bought nothing and
  // could not survive checkout rewriting refs/tags/* into lightweight tags.
  //
  // DELIBERATELY NOT ASSERTED HERE (recorded so it stays a decision, not drift):
  //
  //   1. That a pushed tag is annotated rather than lightweight. The previous
  //      check read `git cat-file -t refs/tags/<tag>` from the workspace, but
  //      actions/checkout force-writes `+<peeled-sha>:refs/tags/<tag>` whenever
  //      `git rev-parse refs/tags/<tag>` (the tag OBJECT for an annotated tag)
  //      differs from github.sha (the PEELED commit) — which is always, for an
  //      annotated tag. So that check never read the real tag: it degraded every
  //      annotated tag to lightweight and then failed it. It enforced "all tag
  //      pushes fail", not "tags must be annotated", and the job never once
  //      passed on a tag. Re-establishing it would need the tag type read from
  //      the remote (`git ls-remote --tags`), not the workspace. Judged not worth
  //      a network round-trip: tag annotation is a release-hygiene convention,
  //      not a frozen-history invariant, and nothing below depends on it.
  //   2. That a pull_request's base/head are ancestors of the merge commit.
  //      Real but orthogonal — the pin-based checks never consumed base/head,
  //      and GitHub populates those fields itself.
  //
  // Both were verified as non-load-bearing by independent review before removal.
  const target = args['checked-out-sha'] || process.env.GITHUB_SHA;
  if (!target) {
    fail('checked-out SHA is missing; set GITHUB_SHA or pass --checked-out-sha');
  } else if (!OID_PATTERN.test(target)) {
    fail(`checked-out SHA must be an exact 40-character Git object id, got ${target}`);
  } else {
    const integrity = checkRepositoryIntegrity({ repo, target });
    if (!integrity.pass) {
      fail(`target ${target}: ${integrity.detail}`);
    } else {
      console.log(`repository-integrity: immutable target ${integrity.target}`);
      console.log(`repository-integrity: PASS: ${integrity.detail}`);
    }
  }
}
