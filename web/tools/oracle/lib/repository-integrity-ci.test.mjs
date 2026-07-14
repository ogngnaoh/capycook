// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const cli = join(repo, 'web/tools/repository-integrity-ci.mjs');

function runCli(args = []) {
  const env = { ...process.env };
  delete env.GITHUB_SHA;
  return spawnSync(process.execPath, [cli, '--repo', repo, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env,
  });
}

function output(result) {
  return `${result.stdout}${result.stderr}`;
}

describe('repository integrity CI target input', () => {
  test('fails closed when the target is missing', () => {
    const result = runCli();

    expect(result.status).not.toBe(0);
    expect(output(result)).not.toContain('repository-integrity: PASS:');
    expect(output(result)).toContain('checked-out SHA is missing');
  });

  test.each([
    ['short hex', 'c12a95b'],
    ['a ref name', 'HEAD'],
    ['a branch name', 'master'],
    ['uppercase hex', 'C12A95BCEBACAB516EADD65C5FC3C0204C6E9D13'],
  ])('fails closed when the target is %s rather than an exact object id', (_label, target) => {
    const result = runCli(['--checked-out-sha', target]);

    expect(result.status).not.toBe(0);
    expect(output(result)).not.toContain('repository-integrity: PASS:');
    expect(output(result)).toContain('must be an exact 40-character Git object id');
  });

  test('fails closed when the target is well-formed but does not resolve', () => {
    const result = runCli(['--checked-out-sha', 'a'.repeat(40)]);

    expect(result.status).not.toBe(0);
    expect(output(result)).not.toContain('repository-integrity: PASS:');
  });

  test('fails closed on an unexpected argument', () => {
    const result = runCli(['bogus']);

    expect(result.status).not.toBe(0);
    expect(output(result)).not.toContain('repository-integrity: PASS:');
  });

  // The regression this file exists for: the guard used to derive its target
  // from the push event payload, which made it unrunnable on a tag push
  // (actions/checkout rewrites refs/tags/* into a lightweight tag before the
  // guard runs). Reading GITHUB_SHA directly works identically for a branch
  // commit and for a tag's peeled commit.
  test('passes on the checked-out commit, whatever ref carried it', () => {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    const result = runCli(['--checked-out-sha', head]);

    expect(output(result)).toContain('repository-integrity: PASS:');
    expect(result.status).toBe(0);
  });

  test('reads the target from GITHUB_SHA when no flag is passed', () => {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    const result = spawnSync(process.execPath, [cli, '--repo', repo], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_SHA: head },
    });

    expect(output(result)).toContain('repository-integrity: PASS:');
    expect(result.status).toBe(0);
  });
});
