// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { REPO } from './server.mjs';

describe('repository-integrity CI workflow', () => {
  test('guard invokes the tested CLI with full history at the checked-out commit', () => {
    const workflow = readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8');
    const guard = workflow.slice(workflow.indexOf('  guard:'));

    // Full history is not optional: the pin-ancestry and frozen-path checks
    // walk back to fixed baselines, and the CLI fails closed on a shallow repo.
    expect(guard).toContain('fetch-depth: 0');
    expect(guard).toContain('node web/tools/repository-integrity-ci.mjs');
    expect(guard).toContain('github.sha');
    // The guard must never regress to comparing against a moving remote ref:
    // that is what let the frozen-doc check pass vacuously (Task 7 review).
    expect(guard).not.toContain('origin/master');
    expect(guard).not.toMatch(/git fetch|git diff/);
  });

  test('guard does not depend on the push event payload', () => {
    const workflow = readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8');
    const guard = workflow.slice(workflow.indexOf('  guard:'));

    // Deriving the target from the event payload made this job unrunnable on a
    // tag push, because actions/checkout rewrites refs/tags/* into a
    // lightweight tag before the guard executes. github.sha is already the
    // peeled commit for both branch and tag pushes.
    expect(guard).not.toContain('github.event_path');
    expect(guard).not.toContain('github.event_name');
  });
});
