# Handoff — Milestone 01 (end-to-end build)

## Next session start here
**Gate B** (plan task 3.6 stop): user provides DEEPSEEK_API_KEY + LANGFUSE_{PUBLIC_KEY,
SECRET_KEY,HOST} in `.env` and confirms the $10 cap. Then: run the live smoke
(`CAPYCOOK_LIVE_TEST=1 go test ./internal/llm -run Live`), record real fixtures,
verify one trace in Langfuse (screenshot → evidence/phase3/), tag `phase-3-model`,
continue at Phase 4 task 4.1.

## Current state
- Branch `e2e`; Phases 1–2 tagged; Phase 3 built through 3.6 in stub mode (untagged —
  live smoke pending keys). All suites green; e2e passes local + docker with the
  stub-mode banner asserted via GET /api/status.
- LLM edge: prompt pack (golden-tested, arm-parity-tested) + DeepSeek strict
  tool-calling client w/ json_object fallback + persisted USD budget ledger
  (<DB_PATH>.budget.json, pre-call hard-stop at LLM_BUDGET_USD=10) + per-arm evidence
  assembly + OTel→Langfuse spans on GenerateMove only. Synthetic wire fixtures only —
  zero live calls made.

## Active concerns
- Gate B pending: no live call until the user hands over keys + cap confirmation.
- 3.3 caveat: synthetic fixtures assume go-openai's wire mapping of DeepSeek strict
  tool-calls — the Gate-B live smoke records real fixtures to confirm.
- 3.2 open question for Gate B: evidence block sits between constraints and thread
  (better prompt-cache behavior) vs. the spec's assembly listing (evidence after
  thread) — flag to user, reorder if desired.
