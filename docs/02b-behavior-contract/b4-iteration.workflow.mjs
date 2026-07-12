export const meta = {
  name: 'b4-iteration',
  description: 'One B4 fix→judge iteration: preflight, then per cluster builder → guardrail gate → cumulative oracle run → fresh-context judges',
  whenToUse: 'CapyCook milestone 02b slice B4. Invoke once per loop iteration with args {worktree, contractPin, branchBase, previouslyGreen, clusters}. The session lead adjudicates between invocations.',
  phases: [
    { title: 'Preflight', detail: 'self-test artifact fresh @ harness commit, contract pin, PREREGISTRATION, port sweep' },
    { title: 'Build', detail: 'one builder per cluster, sequential — fixes accumulate in the shared worktree' },
    { title: 'Gate', detail: 'freeze diff vs 32afe54, suites (go test/vet, tsc, vitest), build-all' },
    { title: 'Oracle', detail: 'cumulative --only run on :8098' },
    { title: 'Judge', detail: 'fresh-context panel from judge-manifest.json, merged via merge-judgments' },
  ],
}

// args:
//   worktree        absolute path of the persistent 02b worktree
//   contractPin     ratified contract pin commit (965c8eb…)
//   branchBase      commit the branch forked from (cb43431…) — PREREGISTRATION baseline
//   previouslyGreen array of criterion ids flipped green in earlier B4 iterations
//   clusters        [{ name, criteria: [ids], brief, parity?: bool }] — brief is
//                   lead-authored: contract text verbatim + root-cause pointers.
let A = args
if (typeof A === 'string') {
  try { A = JSON.parse(A) } catch (e) { throw new Error('b4-iteration: args arrived as a non-JSON string') }
}
if (!A || !A.worktree || !A.contractPin || !A.branchBase || !Array.isArray(A.clusters) || !A.clusters.length) {
  throw new Error('b4-iteration: args {worktree, contractPin, branchBase, clusters[]} required')
}
const WT = A.worktree
const PIN = A.contractPin
const BASE = A.branchBase
const FROZEN = 'internal/llm/prompts eval/fixtures/seeds.json internal/eval/runner.go data/safety eval/fixtures/move_script.json internal/llm/evidence.go internal/eval/mapping.go'
const prevGreen = Array.isArray(A.previouslyGreen) ? A.previouslyGreen : []

const PREFLIGHT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'detail', 'headCommit', 'selftestCommit', 'harnessClean', 'portClear'],
  properties: {
    ok: { type: 'boolean' }, detail: { type: 'string' },
    headCommit: { type: 'string' }, selftestCommit: { type: 'string' },
    harnessClean: { type: 'boolean' }, portClear: { type: 'boolean' },
  },
}
const BUILD_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['committed', 'commit', 'summary', 'criteriaAddressed'],
  properties: {
    committed: { type: 'boolean' }, commit: { type: 'string' }, summary: { type: 'string' },
    criteriaAddressed: {
      type: 'array',
      items: {
        type: 'object', required: ['id', 'action'], additionalProperties: false,
        properties: { id: { type: 'string' }, action: { type: 'string' }, skipped: { type: 'boolean' }, skipReason: { type: 'string' } },
      },
    },
    filesTouched: { type: 'array', items: { type: 'string' } },
    testsRun: { type: 'string' }, deviations: { type: 'string' },
  },
}
const GATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['pass', 'freezeDiffEmpty', 'pinIntact', 'preregUntouched', 'goTest', 'goVet', 'tsc', 'vitest', 'buildAll', 'detail'],
  properties: {
    pass: { type: 'boolean' }, freezeDiffEmpty: { type: 'boolean' }, pinIntact: { type: 'boolean' },
    preregUntouched: { type: 'boolean' }, goTest: { type: 'string' }, goVet: { type: 'string' },
    tsc: { type: 'string' }, vitest: { type: 'string' }, buildAll: { type: 'string' },
    uncommitted: { type: 'string' }, detail: { type: 'string' },
  },
}
const ORACLE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['exitCode', 'runDir', 'runNumber', 'summary', 'perCriterion', 'judgeEntries'],
  properties: {
    exitCode: { type: 'integer' }, runDir: { type: 'string' }, runNumber: { type: 'integer' },
    summary: { type: 'object' },
    perCriterion: {
      type: 'array',
      items: {
        type: 'object', required: ['id', 'status'], additionalProperties: false,
        properties: { id: { type: 'string' }, status: { type: 'string' }, failureKind: { type: ['string', 'null'] }, detail: { type: 'string' } },
      },
    },
    judgeEntries: {
      type: 'array',
      items: {
        type: 'object', required: ['id', 'criterionText', 'evidence'], additionalProperties: false,
        properties: {
          id: { type: 'string' }, criterionText: { type: 'string' },
          evidence: { type: 'array', items: { type: 'object', required: ['path'], additionalProperties: true, properties: { path: { type: 'string' }, caption: { type: 'string' } } } },
        },
      },
    },
  },
}
const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['verdict', 'reason', 'evidenceSuspect'],
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    reason: { type: 'string' },
    evidenceSuspect: { type: 'boolean' },
  },
}
const MERGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['flipped', 'summary'],
  properties: { flipped: { type: 'integer' }, summary: { type: 'object' } },
}

const preflightPrompt = () => `Preflight gate for one CapyCook 02b B4 oracle iteration. Work in the WORKTREE at ${WT} (never the main checkout). Run these checks and report results faithfully — read-only except the port sweep.

export PATH="/opt/homebrew/bin:$PATH"; cd ${WT}

1. HARNESS CLEAN: \`git status --porcelain -- web/tools/oracle\` must print nothing.
2. SELF-TEST FRESH: read ${WT}/docs/02b-behavior-contract/evidence/selftest-report.json. It must exist with ok === true. Let S = its "harnessCommit". Let H = \`git log -1 --format=%H -- web/tools/oracle\`. Require \`git merge-base --is-ancestor "$H" "$S"\` to exit 0 — i.e. no commit has touched the oracle harness since the self-test ran.
3. CONTRACT PIN: \`git diff ${PIN}..HEAD --stat -- docs/02b-behavior-contract/contract.md\` prints nothing AND \`git status --porcelain -- docs/02b-behavior-contract/contract.md\` prints nothing.
4. PREREGISTRATION: \`git diff ${BASE}..HEAD --stat -- docs/PREREGISTRATION.md\` prints nothing AND \`git status --porcelain -- docs/PREREGISTRATION.md\` prints nothing.
5. PORT SWEEP: \`lsof -ti tcp:8098\` — if it prints PIDs, kill exactly those PIDs (\`lsof -ti tcp:8098 | xargs kill\`; NEVER pkill by name), wait 2s, re-check. portClear = port free at the end.

ok = checks 1–5 all pass. detail = one line per failed check (or "all clear"). Also return headCommit (git rev-parse HEAD) and selftestCommit (S, or "" if missing).`

const builderPrompt = (cluster) => `You are the BUILDER for one iteration of the CapyCook milestone-02b B4 fix→judge loop. Your final message is data for an orchestrator, not prose for a human.

Work EXCLUSIVELY in the worktree ${WT} (branch 02b-behavior-contract). Never touch the main checkout at /Users/hoangngo/Documents/personal-projects/CapyCook.

HARD CONSTRAINTS — violating any aborts the whole loop:
- NEVER edit the 7 frozen instrument paths: ${FROZEN}
- NEVER edit docs/02b-behavior-contract/contract.md or docs/PREREGISTRATION.md
- Do not edit anything under docs/ (the session lead owns docs) and do not edit web/tools/oracle/** (harness edits are the lead's job) unless the cluster brief below EXPLICITLY sanctions a named exception.
- Do not run the oracle (a separate stage does). Do not push. Do not start servers on ports other than transient test needs, and kill anything you start.

Project gotchas: Go is Homebrew-installed — export PATH="/opt/homebrew/bin:$PATH". In web/, Tailwind theme scales are REPLACED, not extended — default-scale classes (min-h-8, font-semibold, leading-none) are silent no-ops; pixel-exact values need bracket classes (min-h-[32px]). Match surrounding code style.

CLUSTER: ${cluster.name}
Criteria to make pass (the oracle re-checks them right after you): ${cluster.criteria.join(', ')}

${cluster.brief}

Definition of done:
- Product changes implemented; run the unit tests relevant to what you touched (cd web && npx vitest run <files>; go test ./<pkg>/... as applicable) and make them green.
- ONE commit on the branch: message 'fix(02b/B4): ${cluster.name}', body listing the criteria addressed. Stage only files you changed (git add <paths>, never git add -A).

Return: per criterion what you changed (or skipped:true + skipReason), filesTouched, testsRun with outcomes, commit hash, and any deviation or ambiguity the session lead must adjudicate (empty string if none).`

const gatePrompt = (cluster) => `Guardrail gate for the CapyCook 02b B4 loop, after the '${cluster.name}' builder. Execute exactly these checks, in order, in the worktree — report outcomes faithfully; do not fix anything.

export PATH="/opt/homebrew/bin:$PATH"; cd ${WT}

1. FREEZE DIFF (must print nothing): git diff 32afe54..HEAD --stat -- ${FROZEN}
2. CONTRACT PIN (both must print nothing): git diff ${PIN}..HEAD --stat -- docs/02b-behavior-contract/contract.md ; git status --porcelain -- docs/02b-behavior-contract/contract.md
3. PREREGISTRATION (both must print nothing): git diff ${BASE}..HEAD --stat -- docs/PREREGISTRATION.md ; git status --porcelain -- docs/PREREGISTRATION.md
4. UNCOMMITTED: git status --porcelain — report the output verbatim in 'uncommitted' (empty is ideal; leftover tracked-file edits mean the builder failed to commit them).
5. make test        → goTest: "pass" or the failing output tail (~20 lines)
6. make vet         → goVet: likewise
7. cd web && npx tsc --noEmit   → tsc: likewise
8. cd web && npx vitest run     → vitest: likewise
9. cd ${WT} && make build-all   → buildAll: likewise

pass = checks 1–3 clean AND 5–9 all exit 0. detail = one line per failure (or "all green").`

const oraclePrompt = (cluster, onlyIds) => `Run the CapyCook 02b oracle for the B4 loop (targeted, cumulative regression set). Mechanical task — execute, parse, return data.

export PATH="/opt/homebrew/bin:$PATH"

1. Port sweep: lsof -ti tcp:8098 — if PIDs print, kill exactly those (lsof -ti tcp:8098 | xargs kill; NEVER pkill by name), wait 2s.
2. cd ${WT}/web && node tools/oracle/oracle.mjs run --only ${onlyIds.join(',')}${cluster.parity ? ' --parity' : ''} --port 8098
   This can take 5–20 minutes — set a large command timeout and let it finish. Exit code 1 just means some criteria fail (expected mid-loop). Exit 2 = harness error, 3 = guardrail abort.
3. It logs "run N → <dir>". Read <dir>/oracle-report.json.

Return: exitCode, runDir (absolute), runNumber, the report's summary object, perCriterion for EXACTLY these ids ${JSON.stringify(onlyIds)} (id, status, failureKind, detail = first failing expectation label/detail line, "" if pass), and judgeEntries = the full parsed contents of <dir>/judge-manifest.json ([] if absent or empty).`

const judgePrompt = (entry, runDir) => `You are a fresh-context JUDGE for the CapyCook UX behavior contract (milestone 02b). You know nothing about the implementation, the builders, or their intent — judge ONLY the criterion text against the evidence files. Your final message is data for an orchestrator.

Criterion (verbatim from the ratified contract):
${entry.criterionText}

Evidence — Read each file (they are PNG screenshots/screencast frames), in order:
${entry.evidence.map((e) => `- ${runDir}/${e.path}${e.caption ? ` — ${e.caption}` : ''}`).join('\n')}

Rules:
- Judge only what the evidence shows. Do not give the benefit of the doubt: if the criterion's requirement is not visibly satisfied in the evidence, the verdict is FAIL.
- evidenceSuspect: set true if any frame looks like a capture artifact (blank/black frame, pre-paint white flash, truncated UI) rather than a genuine app state — the lead re-captures instead of counting a strike. Still return your best verdict on what IS visible.
- reason: one line, concrete, naming what you saw.`

const mergePrompt = (verdicts, runDir) => `Mechanical task in the CapyCook 02b worktree. Write the following JSON array VERBATIM to ${runDir}/judge-verdicts.json, except: add to each object a "judgedAt" field set to the current UTC time in ISO-8601 (get it via \`date -u +%Y-%m-%dT%H:%M:%SZ\`).

${JSON.stringify(verdicts, null, 1)}

Then run:
export PATH="/opt/homebrew/bin:$PATH" && cd ${WT}/web && node tools/oracle/oracle.mjs merge-judgments ${runDir}/judge-verdicts.json --report ${runDir}/oracle-report.json

Return: flipped (count it reported) and the updated summary object from ${runDir}/oracle-report.json.`

// ------------------------------------------------------------------ run ---
phase('Preflight')
const pre = await agent(preflightPrompt(), { schema: PREFLIGHT_SCHEMA, label: 'preflight', effort: 'low' })
if (!pre || !pre.ok) {
  log(`preflight REFUSED: ${pre ? pre.detail : 'agent lost'}`)
  return { aborted: 'preflight', preflight: pre }
}
log(`preflight ok @ ${pre.headCommit.slice(0, 7)} (self-test @ ${pre.selftestCommit.slice(0, 7)})`)

const iterations = []
const greenSoFar = [...prevGreen]
for (let i = 0; i < A.clusters.length; i++) {
  const cluster = A.clusters[i]
  const record = { cluster: cluster.name, criteria: cluster.criteria }

  const build = await agent(builderPrompt(cluster), { schema: BUILD_SCHEMA, label: `build:${cluster.name}`, phase: 'Build' })
  record.build = build
  if (!build || !build.committed) {
    log(`builder for ${cluster.name} did not commit — aborting invocation`)
    record.aborted = 'build'
    iterations.push(record)
    break
  }
  log(`built ${cluster.name} @ ${build.commit.slice(0, 7)}${build.deviations ? ' — DEVIATIONS flagged' : ''}`)

  const gate = await agent(gatePrompt(cluster), { schema: GATE_SCHEMA, label: `gate:${cluster.name}`, phase: 'Gate', effort: 'low' })
  record.gate = gate
  if (!gate || !gate.pass) {
    log(`guardrail gate FAILED after ${cluster.name}: ${gate ? gate.detail : 'agent lost'} — aborting invocation`)
    record.aborted = 'gate'
    iterations.push(record)
    break
  }

  const onlyIds = [...new Set([...greenSoFar, ...cluster.criteria])]
  const oracle = await agent(oraclePrompt(cluster, onlyIds), { schema: ORACLE_SCHEMA, label: `oracle:${cluster.name}`, phase: 'Oracle', effort: 'low' })
  record.oracle = oracle
  if (!oracle || oracle.exitCode >= 2) {
    log(`oracle run aborted (exit ${oracle ? oracle.exitCode : '?'}) — stopping invocation`)
    record.aborted = 'oracle'
    iterations.push(record)
    break
  }

  if (oracle.judgeEntries.length) {
    log(`judging ${oracle.judgeEntries.length} criteria (fresh contexts)`)
    const judged = await parallel(oracle.judgeEntries.map((entry) => () =>
      agent(judgePrompt(entry, oracle.runDir), { schema: JUDGE_SCHEMA, label: `judge:${entry.id}`, phase: 'Judge' })
        .then((v) => v && { id: entry.id, verdict: v.verdict, reason: v.reason, evidenceSuspect: v.evidenceSuspect })))
    record.judges = judged.filter(Boolean)
    record.merge = await agent(mergePrompt(record.judges.map(({ id, verdict, reason }) => ({ id, verdict, reason })), oracle.runDir),
      { schema: MERGE_SCHEMA, label: `merge:${cluster.name}`, phase: 'Judge', effort: 'low' })
  }

  // Judge verdicts override assert-side status for judge-tagged rows.
  const judgeById = new Map((record.judges || []).map((j) => [j.id, j]))
  record.flipped = { green: [], stillFailing: [], regressed: [] }
  for (const row of oracle.perCriterion) {
    const j = judgeById.get(row.id)
    const passed = j ? j.verdict === 'PASS' : row.status === 'pass'
    if (cluster.criteria.includes(row.id)) (passed ? record.flipped.green : record.flipped.stillFailing).push(row.id)
    else if (!passed) record.flipped.regressed.push(row.id)
  }
  for (const id of record.flipped.green) if (!greenSoFar.includes(id)) greenSoFar.push(id)
  log(`${cluster.name}: green ${record.flipped.green.join(', ') || '—'} · still failing ${record.flipped.stillFailing.join(', ') || '—'} · regressed ${record.flipped.regressed.join(', ') || '—'}`)
  iterations.push(record)
}

return {
  preflight: { headCommit: pre.headCommit, selftestCommit: pre.selftestCommit },
  iterations,
  greenAfter: greenSoFar,
}
