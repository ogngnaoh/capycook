// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const cli = join(repo, 'web/tools/repository-integrity-ci.mjs');
const fixtures = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { force: true, recursive: true });
});

function runCli(args = []) {
  const env = { ...process.env };
  delete env.GITHUB_EVENT_PATH;
  delete env.GITHUB_EVENT_NAME;
  delete env.GITHUB_SHA;
  return spawnSync(process.execPath, [cli, '--repo', repo, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env,
  });
}

function eventFile(contents) {
  const fixture = mkdtempSync(join(tmpdir(), 'capycook-integrity-cli-'));
  fixtures.push(fixture);
  const path = join(fixture, 'event.json');
  writeFileSync(path, contents);
  return path;
}

function output(result) {
  return `${result.stdout}${result.stderr}`;
}

describe('repository integrity CI event input', () => {
  test.each([
    ['null', 'null'],
    ['false', 'false'],
    ['zero', '0'],
    ['empty string', '""'],
    ['array', '[]'],
  ])('rejects valid JSON with invalid %s event shape', (_label, payload) => {
    const result = runCli([
      '--event-path', eventFile(payload),
      '--event-name', 'push',
      '--checked-out-sha', '41b0ec40d318db4b57a5e9fd1602845a873495f8',
    ]);

    expect(result.status).not.toBe(0);
    expect(output(result)).not.toContain('repository-integrity: PASS:');
    expect(output(result)).toContain('event payload is missing or invalid');
  });

  test('fails closed when event input is missing', () => {
    const result = runCli();

    expect(result.status).not.toBe(0);
    expect(output(result)).not.toContain('repository-integrity: PASS:');
    expect(output(result)).toContain('event path is missing');
  });

  test('fails closed when event JSON is malformed', () => {
    const path = eventFile('{');
    const result = runCli(['--event-path', path]);

    expect(result.status).not.toBe(0);
    expect(output(result)).not.toContain('repository-integrity: PASS:');
    expect(output(result)).toContain(`cannot read event payload ${path}`);
  });
});
