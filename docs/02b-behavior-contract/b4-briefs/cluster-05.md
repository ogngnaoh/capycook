# B4 cluster 5 brief — typed-input preservation

Criteria: BC-A-13, BC-C-21, BC-C-27, BC-E-5 (all assert). Verbatim contract
text at the end. One defect class across three components: forms clear/close
fire-and-forget at dispatch, before the outcome is known — a failure or cancel
silently discards what the cook typed.

## Root causes (census run-073, contract FAILS-TODAY markers)

1. **BC-A-13** — `web/src/components/IntentBar.tsx` clears its state
   unconditionally at dispatch. Needs: on move FAILURE the intent text (and
   scale value) is restored; on cancel (Stop mid-generation) the in-flight
   intent text is back in `#cc-intent` once Ready. The cancel path resolves in
   `Workbench.tsx` (`cancelMove`/SSE move-cancelled) — you will need a way to
   restore the dispatched text across the IntentBar's clear, e.g. stash the
   in-flight submission at dispatch and restore it on failed/cancelled
   outcomes.
2. **BC-C-21** — `web/src/components/GateBar.tsx` returns to decide mode and
   re-seeds forms fresh regardless of outcome. Needs: on a failed gate POST
   the form stays open (or reopens pre-filled) with the exact steer text /
   take-over JSON / tweak values.
3. **BC-C-27** — `GateBar.tsx` `dispatch` flips to decide the moment the
   safety-override 409 resolves; "Go back — I'll change it" then re-seeds
   from the original draft. Needs: "Go back" returns to take-over mode with
   the textarea byte-identical to what was typed before submit.
4. **BC-E-5** — `web/src/components/CookFlow.tsx` `submit()` clears and closes
   unconditionally. Needs: when the rework POST fails, the form stays open
   with the exact notes text.

## Cautions

- BC-E-4 (green) added trigger-focus-restore on CookFlow close and BC-A-5's
  dispatch mechanics are green — preserve both. When a form STAYS OPEN on
  failure, E-4's close-restore simply doesn't fire (nothing closed) — that is
  correct, don't "fix" it.
- The oracle forces failures by killing the backend or the BC-H-5 second-tab
  race — your restore must key off the actual outcome (failure banner /
  rejected promise), not a timer.
- Do not rename data-testids/ids. No oracle/docs/frozen edits. Full
  `npx vitest run` + `npx tsc --noEmit` green.
- Green set to protect: BC-A-5, B-1, B-4, B-5, C-17, D-2, E-4, H-1/7/8/9
  (+ cluster-4 outcomes, which run before you in this invocation).

## Contract text (verbatim)

**BC-A-13** · assert · A failed OR cancelled move never discards typed input:
when a move dispatched from the intent bar or scale form fails, or the cook
Stops it mid-generation (often precisely to rephrase), the text is restored, not
cleared. **[FAILS TODAY — `IntentBar.tsx` clears its state unconditionally at
dispatch, before any outcome is known]**
Check: fast; type a distinctive intent, force `POST .../moves` to fail → after
the failure banner, `#cc-intent` still contains that string; repeat for
`#cc-scale-servings`. Cancel variant (live-sim): submit an intent, click Stop →
once Ready, `#cc-intent` contains the in-flight text again.

**BC-C-21** · assert · A failed gate submission never discards typed input: on a
redirect / take-over / tweak failure, the form stays open (or reopens pre-filled)
with the exact steer text / JSON / edits the cook entered. **[FAILS TODAY —
`GateBar.tsx` returns to decide mode and re-seeds forms fresh regardless of
outcome]**
Check: fast; type a distinctive steer string, force `POST .../gate` to fail (kill
the backend or BC-H-5's second-tab race) → after the failure banner, the redirect
field still contains that exact string; repeat for the take-over JSON and a tweak
value.

**BC-C-27** · assert · The safety-override's "Go back — I'll change it" preserves
the exact edit that tripped it: choosing it returns the gate to take-over mode
with the textarea pre-filled with the cook's own typed JSON — never a reset to
decide mode or a fresh dump of the pre-edit draft. **[FAILS TODAY —
`GateBar.tsx` `dispatch` flips to decide the moment the 409 resolves, and
re-opening re-seeds from the original draft; the cook's edit is silently gone]**
Check: fast; submit a take-over draft containing the garlic-in-oil op; at the
override prompt click "Go back — I'll change it" → the take-over textarea is
visible again and its value is byte-identical to what was typed before submit.

**BC-E-5** · assert · A failed rework submission never discards typed tasting
notes: when "Rework from these notes" fails, the form stays open with the exact
notes text still present. **[FAILS TODAY — `CookFlow.tsx` `submit()` clears and
closes unconditionally, the same fire-and-forget pattern as BC-A-13/BC-C-21]**
Check: fast; open "I cooked this", type distinctive notes, force the rework
`POST .../moves` to fail → after the failure banner, `#cc-tasting-notes` is
still open and contains that exact text.
