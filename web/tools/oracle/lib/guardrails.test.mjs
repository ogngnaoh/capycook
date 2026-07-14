// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  PREREGISTRATION_02B_EXIT,
  PREREGISTRATION_02B_OPENING,
  checkPreregistration,
} from './guardrails.mjs';

const EXPECTED_OPENING = '4c3a6f7c043d8fbcdd50852302e2a8f3e5bae79b';
const EXPECTED_EXIT = '9aee534af935aeb327321d12ea8cfa23e99246d2';
const repos = [];

afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { force: true, recursive: true });
});

function git(repo, ...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function commit(repo, message, files) {
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(repo, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  }
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
}

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'capycook-prereg-guardrail-'));
  repos.push(repo);
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Oracle Guardrail Test');
  git(repo, 'config', 'user.email', 'oracle-guardrail@example.invalid');
  commit(repo, 'baseline', { 'docs/PREREGISTRATION.md': 'frozen\n' });
  const opening = commit(repo, 'open 02b', { 'milestone.txt': 'open\n' });
  return { repo, opening };
}

describe('BC-J-4 preregistration guardrail', () => {
  test('current HEAD passes when PREREGISTRATION changed only after the 02b exit', () => {
    const result = checkPreregistration();

    expect(PREREGISTRATION_02B_OPENING).toBe(EXPECTED_OPENING);
    expect(PREREGISTRATION_02B_EXIT).toBe(EXPECTED_EXIT);
    expect(result).toEqual({
      id: 'BC-J-4',
      pass: true,
      detail: 'PREREGISTRATION.md untouched throughout 02b interval 4c3a6f7..9aee534 (working tree clean)',
    });
  });

  test('a committed change inside the protected interval fails', () => {
    const { repo, opening } = makeRepo();
    const exit = commit(repo, 'mutate preregistration', {
      'docs/PREREGISTRATION.md': 'changed during 02b\n',
    });

    const result = checkPreregistration({ repo, openingRef: opening, exitRef: exit });

    expect(result.pass).toBe(false);
    expect(result.detail).toContain(`protected 02b interval ${opening.slice(0, 7)}..${exit.slice(0, 7)}`);
    expect(result.detail).toContain(exit);
  });

  test('mutate-then-revert history inside the protected interval still fails', () => {
    const { repo, opening } = makeRepo();
    const mutation = commit(repo, 'mutate preregistration', {
      'docs/PREREGISTRATION.md': 'temporary change\n',
    });
    const exit = commit(repo, 'revert preregistration', {
      'docs/PREREGISTRATION.md': 'frozen\n',
    });

    const result = checkPreregistration({ repo, openingRef: opening, exitRef: exit });

    expect(result.pass).toBe(false);
    expect(result.detail).toContain(`protected 02b interval ${opening.slice(0, 7)}..${exit.slice(0, 7)}`);
    expect(result.detail).toContain(mutation);
    expect(result.detail).toContain(exit);
  });

  test('a committed post-exit change does not fail the fixed 02b interval', () => {
    const { repo, opening } = makeRepo();
    const exit = commit(repo, 'ship 02b', { 'milestone.txt': 'shipped\n' });
    commit(repo, 'authorized post-exit amendment', {
      'docs/PREREGISTRATION.md': 'authorized amendment\n',
    });

    const result = checkPreregistration({ repo, openingRef: opening, exitRef: exit });

    expect(result).toEqual({
      id: 'BC-J-4',
      pass: true,
      detail: `PREREGISTRATION.md untouched throughout 02b interval ${opening.slice(0, 7)}..${exit.slice(0, 7)} (working tree clean)`,
    });
  });

  test('an uncommitted working-tree edit still fails', () => {
    const { repo, opening } = makeRepo();
    const exit = commit(repo, 'ship 02b', { 'milestone.txt': 'shipped\n' });
    writeFileSync(join(repo, 'docs/PREREGISTRATION.md'), 'uncommitted edit\n');

    const result = checkPreregistration({ repo, openingRef: opening, exitRef: exit });

    expect(result.pass).toBe(false);
    expect(result.detail).toBe('PREREGISTRATION.md has uncommitted working-tree changes');
  });

  test('a missing protected-interval ref fails closed', () => {
    const { repo, opening } = makeRepo();

    const result = checkPreregistration({ repo, openingRef: opening, exitRef: 'missing-exit-ref' });

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('unable to verify protected 02b interval');
    expect(result.detail).toContain('git log exited 128');
  });
});
