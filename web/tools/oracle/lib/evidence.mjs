// Evidence directory management: docs/02b-behavior-contract/evidence/run-NNN/
// (gitignored except the final run, un-ignored at B5). Layout:
//   run-NNN/oracle-report.json
//   run-NNN/judge-manifest.json
//   run-NNN/<scenario-id>/<BC-id>/<subcheck>-{pass|fail}.png|-detail.json
//   run-NNN/judge/<BC-id>/NN-<label>.png
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

export function nextRunDir(root) {
  mkdirSync(root, { recursive: true });
  const nums = readdirSync(root)
    .map((d) => /^run-(\d{3})$/.exec(d))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const number = (nums.length ? Math.max(...nums) : 0) + 1;
  const dir = join(root, `run-${String(number).padStart(3, '0')}`);
  mkdirSync(dir, { recursive: true });
  return { dir, number };
}

export class EvidenceSink {
  constructor(runDir) {
    this.runDir = runDir;
  }
  pathFor(scenarioId, criterionId, name) {
    return join(this.runDir, scenarioId, criterionId, name);
  }
  // Returns the run-relative path (what goes into the report).
  write(scenarioId, criterionId, name, data) {
    const abs = this.pathFor(scenarioId, criterionId, name);
    mkdirSync(dirname(abs), { recursive: true });
    if (Buffer.isBuffer(data)) writeFileSync(abs, data);
    else writeFileSync(abs, JSON.stringify(data, null, 2));
    return relative(this.runDir, abs);
  }
  judgeDir(criterionId) {
    const dir = join(this.runDir, 'judge', criterionId);
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  writeJudgeStill(criterionId, name, buffer) {
    const abs = join(this.judgeDir(criterionId), name);
    writeFileSync(abs, buffer);
    return relative(this.runDir, abs);
  }
  writeRoot(name, obj) {
    const abs = join(this.runDir, name);
    writeFileSync(abs, JSON.stringify(obj, null, 2));
    return abs;
  }
  exists(relPath) {
    return existsSync(join(this.runDir, relPath));
  }
}
