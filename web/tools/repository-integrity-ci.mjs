#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  checkRepositoryIntegrity,
  resolveIntegrityEvent,
} from './oracle/lib/guardrails.mjs';

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
  const eventPath = args['event-path'] || process.env.GITHUB_EVENT_PATH;
  const eventName = args['event-name'] || process.env.GITHUB_EVENT_NAME;
  const checkedOutSha = args['checked-out-sha'] || process.env.GITHUB_SHA;
  if (!eventPath) {
    fail('event path is missing');
  } else {
    let event;
    try {
      event = JSON.parse(readFileSync(eventPath, 'utf8'));
    } catch (error) {
      fail(`cannot read event payload ${eventPath}: ${error.message}`);
    }
    if (event) {
      const selected = resolveIntegrityEvent({ repo, eventName, event, checkedOutSha });
      if (!selected.pass) {
        fail(selected.detail);
      } else {
        console.log(`repository-integrity: immutable event: ${selected.detail}`);
        const integrity = checkRepositoryIntegrity({ repo, target: selected.target });
        if (!integrity.pass) {
          fail(`target ${selected.target}: ${integrity.detail}`);
        } else {
          console.log(`repository-integrity: immutable target ${integrity.target}`);
          console.log(`repository-integrity: PASS: ${integrity.detail}`);
        }
      }
    }
  }
}
