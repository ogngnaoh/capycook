# Phase 5.4 — convergence-loop self-critique (pre-Gate C)

Build → headless screenshot → self-critique → refine, capped at 3 refine
iterations, judged against DESIGN-SYSTEM.md's Do/Don't + the locked design
language (Acne structure + Anthropic warm layer, spec §1.6/§8).

**Setup.** Stub mode (no model key), fresh SQLite DB per run, `DATA_DIR`
pointing at the vendored data, headless Chrome at 1440×1000. One scripted
pass drives the full loop per theme: seed intake → empty workbench →
streaming → proposal diff → edit / take-over / unsafe-override / alternatives
→ accept + analysis → garlic-oil block → redirect recovery → version history
→ snapshot → promote → post-cook "I cooked this" → branch indicators →
dial auto-applied. 19 states × 2 themes = 38 screenshots
(`NN-state-{light,dark}.png`). Themes pinned via the `capycook-theme`
localStorage key the header toggle uses.

## Checklist applied to every shot

~90% neutral ivory/oat/hairline/slate · at most one terracotta hero per
view · square corners, hairline borders, no shadows/gradients · 12px resting
size, uppercase labels, 500 only for subtle emphasis · chips labeled, never
color-only · controls say exactly what happens · dark-theme contrast
plausible (AA-tuned companion palette).

## Iteration 1 → 2 (found by the first screenshot pass)

1. **Stale proposal-ready resurrected a resolved gate (behavior bug, TDD'd).**
   The SSE hub replays rationale tokens on a cadence and emits
   `proposal-ready` at the end; stub moves resolve instantly, so accepting
   before the replay tail landed re-opened a gate the server had already
   resolved (UI stuck at AWAITING GATE, server idle). Fixed in `Workbench`
   with an expected-move guard (set on POST /move, gate verbs that spawn
   moves, and `inFlightMoveId` on re-sync; cleared on resolution). Failing
   test first: "a stale proposal-ready after the gate resolves does not
   resurrect the card".
2. **Pane widths were silent no-ops (layout bug).** The Tailwind theme
   *replaces* the spacing scale with the 5px rhythm (keys 0–9), so
   `w-96`/`w-72` didn't exist — the steering/versions panes sized to content
   and crushed the draft pane to a letter-wide strip once versions opened.
   Fixed with named widths on the 5px rhythm (`w-steering` 390px,
   `w-versions` 290px) in the config extend.
3. **Disabled filled CTAs competed with the primary.** A washed-terracotta
   disabled "Propose a move" sat next to the live ACCEPT — two accent blocks
   per view. All filled primaries now go neutral (oat surface + muted text)
   when disabled; only a live primary wears the accent.
4. **Empty-state copy invited unavailable actions.** "Empty draft — propose
   the first move" rendered above a pending proposal (and while blocked).
   Now state-aware: review the proposal / resolve the blocked move / a move
   is being proposed; the steering pane's empty-thread line respects
   `canPropose` the same way. TDD'd.

## Iteration 2 → 3

5. **The thread didn't follow new turns.** Streamed tokens, post-cook
   entries, and the auto-applied row landed below the fold. The thread now
   pins to the newest turn unless the cook has scrolled up to read older
   ones (two failing tests first, `SteeringPane.test.tsx`).

## Iteration 3 (capture-extension pass)

6. Extended the evidence set with the four gate-verb panels (edit form,
   take-over form, unsafe-override prompt, alternatives picker) — reachable
   in stub mode, so they belong in "every screen/state".
7. **Override prompt leaked wire plumbing.** It showed "orchestrator: safety
   warning requires confirm override: …" verbatim. The prompt now shows the
   safety reasons only (TDD'd); the wire prefix stays in the transport.

## What converged

Both themes hold the language across all 19 states: ivory/oat (or warm
near-black) with hairline structure, radius 0 everywhere, no shadows or
gradients, 12px/0.3px uppercase UI voice with mono for ids/data, semantic
tints only behind labeled chips/alerts, terracotta only on the one live
primary, tiny status squares, and the focus ring. Copy calls actions by what
they do (Propose a move, Accept, Send redirect, Propose a rework, I cooked
this) and keeps names stable through the flow.

## Known imperfections left for Gate C judgment

- **`03-rationale-streaming` shows the diff already at the gate.** Stub
  moves resolve instantly server-side, so the card + gate bar appear while
  the rationale theater is still typing. With a live model the gate bar
  would show "Proposing… / Cancel" during generation; that state is
  unit-tested but not honestly reachable as a stub screenshot.
- **`move_failed` banner not captured** — unreachable in stub mode (the stub
  never fails; unknown move types are rejected before a move exists).
  Covered by two Workbench tests (banner distinct from the safety block;
  Try again re-posts the same move). Same for the reconnect banner
  (requires killing the server mid-session; it is the restart-survival GIF
  in task 5.5 and is test-covered).
- **Both alternatives cards render identical content** — the stub template
  produces the same proposal twice. The picker chrome (selection ring,
  SELECTED/CLICK TO SELECT) is still legible; real-model alternatives will
  differ.
- **Two live primaries while the cook-feedback form is open**
  (`16-cook-feedback`): "Propose a rework" (panel-local primary) coexists
  with the steering pane's standing "Propose a move". Judged acceptable —
  each is the primary of its own pane and neither is a hero block — but it
  is the one place the "single filled primary" reading is arguable.
- **Light-theme warning-on-surface is ~3.9:1** (documented token caveat) —
  used only for 11px mono chips that carry their text label; the dark
  companion passes comfortably.
- **Version timestamps use the browser locale string** — consistent but
  unstyled (`7/7/2026, 7:34:40 AM`); could move to a fixed ISO-ish format if
  the mixed format reads as noise.
