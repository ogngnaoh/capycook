# B4 cluster 8 brief — gate semantics (+ C-11 verb wording)

Criteria: BC-C-10, BC-C-20, BC-C-22, BC-C-28 (assert) + BC-C-11 (judge).
Verbatim contract text at the end.

## Root causes (census run-073 + B1 review findings)

1. **BC-C-10** — the alt-card's Option A/B badge glyph is `aria-hidden` and
   the computed accessible name carries only the content blurb. Each
   `[data-testid="alt-card"]`'s accessibility-tree name must include its
   "Option A" / "Option B" identifier (sr-only text or aria-label composition).
2. **BC-C-20** — during the second alternative's generation window, a
   complete single-proposal gate bar renders for option A alone (focus on
   Accept); committing drops option B silently. While only one of two
   alternatives exists: either no `button[data-verb="accept"]` is
   present/focusable, or only `[data-testid="alternatives-picker"]` shows —
   never a single-proposal gate bar. Once both cards exist, picking one
   stages a normal BC-C-10 decision.
3. **BC-C-22** — `aria-expanded` appears nowhere in the shipped components:
   the "Try another way" disclosure toggle needs `aria-expanded="false"`
   closed → `"true"` once the four `data-verb` buttons are revealed.
4. **BC-C-28** — structurally-invalid take-over drafts commit silently:
   client does a bare `JSON.parse` type-assertion; the Go server decodes with
   zero-value semantics (deleting the `"steps"` key commits a trial with
   steps wiped). Reject BEFORE commit with a visible `role="alert"` error:
   client-side shape validation of the required top-level keys/types, and —
   full stack is allowed — harden the server decode path too if you judge it
   right (strict decode / required-field check in the gate handler; NEVER
   touch the 7 frozen instrument paths).
5. **BC-C-11 (judge)** — the disclosure verb label "REGENERATE" reads as
   model/API vocabulary, 4 consecutive fresh judges failed it. Rename the
   VISIBLE LABEL to culinary vocabulary (e.g. "Another take" — pick what a
   cook would say for "redo this proposal from the same intent"; the other
   five verbs pass as-is). ⚠ The `data-verb="regenerate"` ATTRIBUTE VALUE is
   oracle selector vocabulary — it must NOT change; only the label text.
   The judge also flags the faint gray disclosure-label contrast — that is
   cluster 11's token work, do NOT fix contrast here.

## Cautions

- C-20 interacts with BC-B-4 trap 2 (alternatives first-arrival focus) —
  B-4 is green; whatever you render for the partial window must not focus
  Stop and must not regress B-4's pinning test.
- Keep gate verbs' accessible behavior intact (C-1..C-9 pass today).
- Do not rename data-testids/ids/data-verb values. No oracle/docs/frozen
  edits. Full `npx vitest run` + `npx tsc --noEmit` green; run `make test`
  if you touch Go.
- Green set to protect (18 ids): A-4, A-5, A-9, A-13, B-1, B-4, B-5, C-13,
  C-17, C-21, C-27, D-2, E-4, E-5, H-1, H-7, H-8, H-9.

## Contract text (verbatim)

**BC-C-10** · assert · "Compare two options" yields exactly two labeled alternative
cards — labeled for assistive tech too, not only visually; picking one stages that
proposal for a normal gate decision. **[A/B naming LIKELY FAILS TODAY — the badge
glyph is `aria-hidden` and the accessible name carries only the content blurb]**
Check: fast; fire `data-verb="alternatives"` → two `[data-testid="alt-card"]`
whose computed accessible names (accessibility-tree name, not the `aria-hidden`
glyph) each include their Option A / Option B identifier; click A → gate bar shows
for A's diff; accepting commits one trial.

**BC-C-11** · judge · The verbs read as culinary decisions, not API calls — a cook
scanning the gate understands what each does to the dish.
Check: fast; screenshot the gate with disclosure open, both themes → judge label
legibility against the six underlying verbs.

**BC-C-20** · assert · "Compare two options" can never be gate-decided on a
partial result: while only the first of the two alternatives has arrived, no
committing gate verb is reachable — the surface withholds the gate toolbar (or
visibly marks "1 of 2 — second option still generating") until both alt-cards
exist. **[FAILS TODAY — during the second option's replay window a complete gate
bar renders for option A alone with focus on Accept; committing drops option B
silently]**
Check: live-sim (the fast profile's back-to-back replay gives no reliable
partial-result window); fire `data-verb="alternatives"`; poll the DOM at the
first moment a proposal-ready lands for this move → either no
`button[data-verb="accept"]` is present/focusable, or only
`[data-testid="alternatives-picker"]` (never a single-proposal gate bar) shows;
once both `[data-testid="alt-card"]` exist, picking one stages a normal decision
per BC-C-10.

**BC-C-22** · assert · The "Try another way" disclosure tells assistive tech what
it did: the toggle carries `aria-expanded` — false closed, true once the four
verbs are revealed. **[LIKELY FAILS TODAY — `aria-expanded` appears nowhere in
the shipped components]**
Check: fast; at the gate in decide mode, the toggle's `aria-expanded` is "false";
activate it → four `data-verb` buttons present AND `aria-expanded` is "true".

**BC-C-28** · assert · A structurally-invalid take-over draft — valid JSON, wrong
shape (a required top-level key missing or type-mismatched) — is rejected before
commit with a visible `role="alert"` error; never a silent partial commit.
**[FAILS TODAY — client does a bare `JSON.parse` type-assertion and the server
decodes with Go zero-value semantics: deleting the `"steps"` key commits a trial
with the steps silently wiped]**
Check: fast; open take-over, delete the entire `steps` key from the pre-filled
JSON (still valid JSON), submit → Save is blocked with a visible error, no trial
commits, `GET /versions` unchanged; repeat with `"ingredients"` set to a string.
