// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { REPO } from './server.mjs';

describe('repository-integrity CI workflow', () => {
  test('guard invokes the tested CLI with full history and immutable event inputs', () => {
    const workflow = readFileSync(join(REPO, '.github/workflows/ci.yml'), 'utf8');
    const guard = workflow.slice(workflow.indexOf('  guard:'));

    expect(guard).toContain('fetch-depth: 0');
    expect(guard).toContain('node web/tools/repository-integrity-ci.mjs');
    expect(guard).toContain('github.event_path');
    expect(guard).toContain('github.event_name');
    expect(guard).toContain('github.sha');
    expect(guard).not.toContain('origin/master');
    expect(guard).not.toMatch(/git fetch|git diff/);
  });
});
