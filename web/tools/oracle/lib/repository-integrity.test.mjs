// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import * as guardrails from './guardrails.mjs';

const repos = [];
const MARKER = '## 9. Amendment log';
const FROZEN_FILES = {
  'internal/llm/prompts/system.txt': 'prompt\n',
  'eval/fixtures/seeds.json': '{}\n',
  'internal/eval/runner.go': 'package eval\n',
  'data/safety/rules.json': '{}\n',
  'eval/fixtures/move_script.json': '{}\n',
  'internal/llm/evidence.go': 'package llm\n',
  'internal/eval/mapping.go': 'package eval\n',
};

afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { force: true, recursive: true });
});

function git(repo, ...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function write(repo, path, contents) {
  const absolute = join(repo, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function commit(repo, message, files) {
  for (const [path, contents] of Object.entries(files)) write(repo, path, contents);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
}

function prereg(body = '# Frozen methodology\n', rows = '| Date | Amendment |\n') {
  return `${body}\n${MARKER}\n\n${rows}`;
}

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'capycook-integrity-'));
  repos.push(repo);
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Repository Integrity Test');
  git(repo, 'config', 'user.email', 'integrity@example.invalid');
  const baseline = commit(repo, 'T0 baseline', {
    ...FROZEN_FILES,
    'docs/PREREGISTRATION.md': prereg(),
  });
  const baselineBlob = git(repo, 'rev-parse', `${baseline}:docs/PREREGISTRATION.md`);
  return { repo, baseline, baselineBlob };
}

function check(options) {
  expect(guardrails.checkRepositoryIntegrity).toBeTypeOf('function');
  return guardrails.checkRepositoryIntegrity(options);
}

function options(repo, baseline, baselineBlob, extra = {}) {
  return {
    repo,
    target: 'HEAD',
    frozenBaseline: baseline,
    preregistrationBaseline: baseline,
    approvedPreregistrationBlobs: [baselineBlob],
    ...extra,
  };
}

describe('repository-integrity source of truth', () => {
  test('the real current repository accepts all seven authorized PREREGISTRATION states', () => {
    const result = check({ target: 'HEAD' });

    expect(result.pass).toBe(true);
    expect(result.approvedPreregistrationBlobs).toHaveLength(7);
    expect(result.approvedPreregistrationBlobs.at(-1)).toBe('be5748ebf5c7cd6681fae255e286561b5a4b5745');
    expect(result.detail).toContain('7 approved PREREGISTRATION states');
  });

  test('a permanent instrument mutate then revert fails despite identical endpoint bytes', () => {
    const { repo, baseline, baselineBlob } = makeRepo();
    const mutation = commit(repo, 'mutate frozen instrument', {
      'internal/eval/runner.go': 'package eval // unauthorized\n',
    });
    const revert = commit(repo, 'restore frozen instrument bytes', {
      'internal/eval/runner.go': FROZEN_FILES['internal/eval/runner.go'],
    });
    expect(git(repo, 'diff', baseline, 'HEAD', '--', 'internal/eval/runner.go')).toBe('');

    const result = check(options(repo, baseline, baselineBlob));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('permanently frozen paths have post-pin history touches');
    expect(result.detail).toContain(mutation);
    expect(result.detail).toContain(revert);
  });

  test('a section 1-8 mutate then revert fails although target prefix equals T0', () => {
    const { repo, baseline, baselineBlob } = makeRepo();
    const mutation = commit(repo, 'mutate frozen methodology', {
      'docs/PREREGISTRATION.md': prereg('# Mutated methodology\n'),
    });
    commit(repo, 'restore frozen methodology bytes', {
      'docs/PREREGISTRATION.md': prereg(),
    });

    const result = check(options(repo, baseline, baselineBlob));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('unapproved PREREGISTRATION state');
    expect(result.detail).toContain(mutation);
  });

  test.each([
    ['add', prereg('# Frozen methodology\n', '| Date | Amendment |\n| 2099 | unauthorized |\n')],
    ['edit', prereg('# Frozen methodology\n', '| Date | Edited unauthorized row |\n')],
    ['delete', prereg('# Frozen methodology\n', '')],
  ])('an unapproved section 9 %s fails', (_kind, contents) => {
    const { repo, baseline, baselineBlob } = makeRepo();
    const bad = commit(repo, 'unapproved amendment-log state', {
      'docs/PREREGISTRATION.md': contents,
    });

    const result = check(options(repo, baseline, baselineBlob));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('unapproved PREREGISTRATION state');
    expect(result.detail).toContain(bad);
  });

  test('an unapproved section 9 mutate then revert fails', () => {
    const { repo, baseline, baselineBlob } = makeRepo();
    const mutation = commit(repo, 'temporarily add unauthorized amendment', {
      'docs/PREREGISTRATION.md': prereg('# Frozen methodology\n', '| Date | Amendment |\n| 2099 | unauthorized |\n'),
    });
    commit(repo, 'restore approved amendment log', {
      'docs/PREREGISTRATION.md': prereg(),
    });

    const result = check(options(repo, baseline, baselineBlob));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain(mutation);
  });

  test.each([
    ['missing target', 'missing-target'],
    ['zero target', '0000000000000000000000000000000000000000'],
  ])('%s fails closed', (_label, target) => {
    const { repo, baseline, baselineBlob } = makeRepo();

    const result = check(options(repo, baseline, baselineBlob, { target }));

    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/target|zero/i);
  });

  test('a missing fixed pin fails closed', () => {
    const { repo, baselineBlob } = makeRepo();

    const result = check(options(repo, 'missing-pin', baselineBlob));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('missing-pin');
  });

  test('a shallow checkout fails closed even when its target files are present', () => {
    const source = makeRepo();
    commit(source.repo, 'descendant', { 'ordinary.txt': 'ok\n' });
    const repo = mkdtempSync(join(tmpdir(), 'capycook-integrity-shallow-'));
    repos.push(repo);
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${source.repo}`, repo]);

    const result = check(options(repo, source.baseline, source.baselineBlob));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('shallow');
  });

  test.each([
    ['missing marker', '# Frozen methodology\n'],
    ['duplicate marker', prereg() + `\n${MARKER}\n`],
  ])('%s fails closed', (_label, contents) => {
    const { repo, baseline, baselineBlob } = makeRepo();
    commit(repo, 'bad marker state', { 'docs/PREREGISTRATION.md': contents });
    const targetBlob = git(repo, 'rev-parse', 'HEAD:docs/PREREGISTRATION.md');

    const result = check(options(repo, baseline, baselineBlob, {
      approvedPreregistrationBlobs: [baselineBlob, targetBlob],
    }));

    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/marker.*exactly once/i);
  });

  test('Git spawn errors fail closed and include spawnSync().error', () => {
    const { repo, baseline, baselineBlob } = makeRepo();
    const spawn = () => ({
      status: null,
      stdout: '',
      stderr: '',
      error: new Error('synthetic spawn failure'),
    });

    const result = check(options(repo, baseline, baselineBlob, { spawn }));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('synthetic spawn failure');
  });
});
