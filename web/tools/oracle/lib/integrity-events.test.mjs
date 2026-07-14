// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import * as guardrails from './guardrails.mjs';

const repos = [];
const ZERO = '0000000000000000000000000000000000000000';

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
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
}

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'capycook-integrity-event-'));
  repos.push(repo);
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Integrity Event Test');
  git(repo, 'config', 'user.email', 'integrity-event@example.invalid');
  const before = commit(repo, 'before', { 'docs/PREREGISTRATION.md': 'before\n' });
  const after = commit(repo, 'after', { 'docs/PREREGISTRATION.md': 'after\n' });
  return { repo, before, after };
}

function resolve(options) {
  expect(guardrails.resolveIntegrityEvent).toBeTypeOf('function');
  return guardrails.resolveIntegrityEvent(options);
}

describe('immutable CI event target selection', () => {
  test('release regression: moving origin/master self-comparison is empty but event target remains after', () => {
    const { repo, before, after } = makeRepo();
    git(repo, 'update-ref', 'refs/remotes/origin/master', after);
    expect(git(repo, 'diff', 'origin/master...HEAD', '--', 'docs/PREREGISTRATION.md')).toBe('');

    const result = resolve({
      repo,
      eventName: 'push',
      checkedOutSha: after,
      event: { ref: 'refs/heads/master', before, after, created: false, deleted: false },
    });

    expect(result).toMatchObject({ pass: true, kind: 'branch-push', target: after, before });
    expect(result.target).not.toBe('origin/master');
  });

  test('a new branch validates the nonzero after target from fixed pins', () => {
    const { repo, after } = makeRepo();

    const result = resolve({
      repo,
      eventName: 'push',
      checkedOutSha: after,
      event: { ref: 'refs/heads/topic', before: ZERO, after, created: true, deleted: false },
    });

    expect(result).toMatchObject({ pass: true, kind: 'branch-create', target: after, before: null });
  });

  test('a PR validates the checked-out merge target and records immutable base/head', () => {
    const { repo, before: base } = makeRepo();
    git(repo, 'checkout', '-q', '-b', 'feature', base);
    const head = commit(repo, 'feature', { 'feature.txt': 'feature\n' });
    git(repo, 'checkout', '-q', '-b', 'merge-target', base);
    git(repo, 'merge', '--no-ff', '-m', 'synthetic PR merge', head);
    const merge = git(repo, 'rev-parse', 'HEAD');

    const result = resolve({
      repo,
      eventName: 'pull_request',
      checkedOutSha: merge,
      event: { pull_request: { base: { sha: base }, head: { sha: head } } },
    });

    expect(result).toMatchObject({ pass: true, kind: 'pull-request', target: merge, base, head });
  });

  test('an annotated tag validates its exact ref, object, peel, and checked-out target', () => {
    const { repo, after } = makeRepo();
    git(repo, 'tag', '-a', 'v-test', '-m', 'annotated test tag', after);
    const tagObject = git(repo, 'rev-parse', 'refs/tags/v-test');

    const result = resolve({
      repo,
      eventName: 'push',
      checkedOutSha: after,
      event: { ref: 'refs/tags/v-test', before: ZERO, after, created: true, deleted: false },
    });

    expect(result).toMatchObject({
      pass: true,
      kind: 'annotated-tag-create',
      target: after,
      tagObject,
      ref: 'refs/tags/v-test',
    });
  });

  test('an annotated tag replacement records the payload old target and new tag object', () => {
    const { repo, before, after } = makeRepo();
    git(repo, 'tag', '-a', 'v-test', '-m', 'replacement tag', after);
    const tagObject = git(repo, 'rev-parse', 'refs/tags/v-test');

    const result = resolve({
      repo,
      eventName: 'push',
      checkedOutSha: after,
      event: { ref: 'refs/tags/v-test', before, after, created: false, deleted: false },
    });

    expect(result.detail).toContain(`old peeled target ${before}`);
    expect(result.detail).toContain(`new tag object ${tagObject}`);
    expect(result.detail).toContain(`new peeled target ${after}`);
    expect(result).toMatchObject({
      pass: true,
      kind: 'annotated-tag-replace',
      target: after,
      before,
      tagObject,
    });
  });

  test('an annotated tag replacement rejects an old tag object in payload before', () => {
    const { repo, before, after } = makeRepo();
    git(repo, 'tag', '-a', 'old-tag-object', '-m', 'old tag', before);
    const beforeTagObject = git(repo, 'rev-parse', 'refs/tags/old-tag-object');
    git(repo, 'tag', '-a', 'v-test', '-m', 'replacement tag', after);

    const result = resolve({
      repo,
      eventName: 'push',
      checkedOutSha: after,
      event: { ref: 'refs/tags/v-test', before: beforeTagObject, after, created: false, deleted: false },
    });

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('exact old peeled commit target');
  });

  test('an annotated tag event rejects a tag object in payload after', () => {
    const { repo, before, after } = makeRepo();
    git(repo, 'tag', '-a', 'v-test', '-m', 'replacement tag', after);
    const tagObject = git(repo, 'rev-parse', 'refs/tags/v-test');

    const result = resolve({
      repo,
      eventName: 'push',
      checkedOutSha: after,
      event: { ref: 'refs/tags/v-test', before, after: tagObject, created: false, deleted: false },
    });

    expect(result.pass).toBe(false);
    expect(result.detail).toContain(`after ${tagObject} does not equal new peeled target ${after}`);
  });

  test.each([
    ['missing branch after', { ref: 'refs/heads/master', before: 'HEAD' }],
    ['branch deletion', { ref: 'refs/heads/master', before: 'HEAD', after: ZERO, deleted: true }],
    ['missing ref', { before: 'HEAD', after: 'HEAD' }],
  ])('%s fails closed', (_label, event) => {
    const { repo, after } = makeRepo();

    const result = resolve({ repo, eventName: 'push', checkedOutSha: after, event });

    expect(result.pass).toBe(false);
    expect(result.detail).toBeTruthy();
  });

  test('an existing-branch payload with zero before fails closed as inconsistent', () => {
    const { repo, after } = makeRepo();

    const result = resolve({
      repo,
      eventName: 'push',
      checkedOutSha: after,
      event: { ref: 'refs/heads/master', before: ZERO, after, created: false, deleted: false },
    });

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('created');
  });

  test('a checked-out branch SHA different from event.after fails closed', () => {
    const { repo, before, after } = makeRepo();

    const result = resolve({
      repo,
      eventName: 'push',
      checkedOutSha: before,
      event: { ref: 'refs/heads/master', before, after, created: false, deleted: false },
    });

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('checked-out');
  });

  test('a lightweight tag fails closed as unannotated', () => {
    const { repo, after } = makeRepo();
    git(repo, 'tag', 'lightweight', after);

    const result = resolve({
      repo,
      eventName: 'push',
      checkedOutSha: after,
      event: { ref: 'refs/tags/lightweight', before: ZERO, after, created: true, deleted: false },
    });

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('annotated tag');
  });

  test('an unpeelable annotated tag fails closed', () => {
    const { repo, after } = makeRepo();
    writeFileSync(join(repo, 'tag-target.txt'), 'not a commit\n');
    const blob = git(repo, 'hash-object', '-w', 'tag-target.txt');
    const tagInput = `object ${blob}\ntype blob\ntag bad-tag\ntagger Integrity Event Test <integrity-event@example.invalid> 0 +0000\n\nunpeelable\n`;
    const tagObject = execFileSync('git', ['mktag'], { cwd: repo, input: tagInput, encoding: 'utf8' }).trim();
    git(repo, 'update-ref', 'refs/tags/bad-tag', tagObject);

    const result = resolve({
      repo,
      eventName: 'push',
      checkedOutSha: after,
      event: { ref: 'refs/tags/bad-tag', before: ZERO, after, created: true, deleted: false },
    });

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('peel');
  });
});
