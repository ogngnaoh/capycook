# B4 cluster 4 brief — empty-guard validation

Criteria: BC-A-4, BC-A-9, BC-C-13 (all assert). Verbatim contract text at the
end. All three are the same defect class: a submit handler returns (or
dispatches) silently instead of validating and giving visible, programmatically
associated feedback.

## Root causes (census run-073, contract FAILS-TODAY markers)

1. **BC-A-4** — `web/src/components/IntentBar.tsx:32` `submitIntent` returns
   with zero feedback on empty/whitespace intent. Needs: visible validation
   message (`role="alert"` or field-linked error), `#cc-intent`
   keeps/receives focus, no `POST .../moves`.
2. **BC-A-9** — same file, `submitScale()` returns silently on blank/"0"/
   negative servings. Needs: visible message programmatically associated with
   `#cc-scale-servings` (`role="alert"` on the message or `aria-describedby`
   from the field), field focused, no POST. (Non-numeric is the native number
   input's job — out of scope.)
3. **BC-C-13 empty-guard clause** — `web/src/components/GateBar.tsx`
   `submitTweak` dispatches unconditionally. Needs: with every tweak field
   cleared, submit is blocked with visible feedback (disabled Save or a
   validation message) and no `POST .../gate` fires. The criterion's other
   clauses (pre-seeded form, one-trial commit, `role="status"` confirmation)
   should already pass — verify while you're there, fix only if actually
   broken.

## Suggested shape

- Follow the existing validation pattern in `SeedSetup.tsx` (error summary
  with role, aria-invalid on the field) — the repo already has the vocabulary
  for this; reuse it rather than inventing a new pattern.
- Keep the messages in `vocab.ts` if that is where user-facing strings live.

## Cautions

- BC-A-5's dispatch lock and focus mechanics (moveInFlight ref,
  dispatchFocusPending/focusDecisionNow) are green — your guards run BEFORE
  dispatch and must not disturb them.
- The empty-guard must not block legitimate submits (whitespace-only counts
  as empty; a real intent with surrounding spaces is legitimate).
- Do not rename data-testids or ids (`#cc-intent`, `#cc-scale-servings`,
  `[data-testid="tweak-form"]`, `data-verb` attributes). No oracle/docs/frozen
  edits. Full `npx vitest run` + `npx tsc --noEmit` green.
- Green set to protect: BC-A-5, B-1, B-4, B-5, C-17, D-2, E-4, H-1/7/8/9.

## Contract text (verbatim)

**BC-A-4** · assert · Firing "Try it" (click or Enter) with an empty or
whitespace-only intent is never a silent no-op: visible validation feedback appears,
the intent field keeps/receives focus, and no move request is sent. **[FAILS TODAY —
`IntentBar.tsx:32` returns with zero feedback]**
Check: fast; on an idle workbench click "Try it" with `#cc-intent` empty → a visible
validation message appears (role="alert" or linked error), `#cc-intent` is focused,
no `POST .../moves` fires.

**BC-A-9** · assert · Firing "Scale it →" with an invalid value (blank, "0",
negative) is never a silent no-op: visible validation feedback appears, the
field keeps/receives focus, and no move request is sent. (Non-numeric text is
blocked by the native number input itself — not a distinct scenario.) **[FAILS TODAY —
`IntentBar.tsx` `submitScale()` returns silently on invalid values, the same
pattern as BC-A-4's `submitIntent`]**
Check: fast; open the Scale chip's inline form, set `#cc-scale-servings` to each of
"", "0", "-1", fire "Scale it →" → each time a visible validation message appears
that is programmatically associated with the field (`role="alert"` on the message,
or `aria-describedby` from the field), the field is focused, no `POST .../moves`
fires.

**BC-C-13** · assert · "Tweak it" edits the proposal's own content: the form opens
pre-seeded with the proposal's current values, an edited value commits exactly one
new trial reflecting it, and the form can never dispatch a content-free edit.
**[empty-guard clause FAILS TODAY — `GateBar.tsx` `submitTweak` dispatches
unconditionally, no empty-value guard]**
Check: fast; at a gate, click `data-verb="edit"` → `[data-testid="tweak-form"]`
shows one input per op, pre-seeded; change one value, submit → gate closes, spine
gains exactly one trial whose diff (technical view / `GET /versions`) carries the
edited value, and a `role="status"` confirmation fires (parity with BC-C-3's
accept toast); re-open on a fresh proposal, clear every field → submit is blocked
with visible feedback (disabled Save or validation message), no `POST .../gate`
fires.
