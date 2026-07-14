# B4 cluster 3 brief — roles / live regions

Criteria: BC-H-1, BC-H-7, BC-H-8, BC-H-9 (all assert). Verbatim contract text
at the end. All four are missing ARIA roles/focus on load/error states — small
markup + focus-effect changes, no business logic.

## Root causes (census run-073, code @ 4256505)

1. **BC-H-1 + BC-H-7** — the could-not-load error card is a plain `<p>` inside
   a bare `<div>` (`web/src/components/Workbench.tsx:423-431`) and the
   route-focus effect is gated on a loaded dish, so on the error path neither
   `role="alert"` nor any focus move happens. Both criteria share this one
   code path (H-1 = server down, H-7 = unknown dish id). Fix: the error
   container gets `role="alert"` and, on mount, keyboard focus lands on the
   error region (tabIndex={-1} + focus effect) or on the "Back to dishes"
   button — contract accepts either.
2. **BC-H-9** — the loading placeholder is a bare `<div>`
   (`Workbench.tsx:433`): `<div className="p-4 text-muted">Loading the
   dish…</div>` → needs `role="status"` (or an equivalent live region).
3. **BC-H-8** — the landing list-failure message is a plain `<p>`
   (`web/src/App.tsx:73-75`): "The dish list did not load — check the server
   and refresh." → needs `role="status"`/aria-live; the seed form must remain
   fully usable (it already is — don't touch it).

## Cautions

- The H-1/H-7 focus effect must fire ONLY when the error card mounts — never
  on successful loads, never on the landing page, and it must not fight the
  existing SPA route-focus management (App.tsx routeNonce pattern, audit #9).
- role="alert" containers are implicit live regions — do not nest them inside
  or wrap them around the existing polite live region used by `announce()`.
- Do not rename data-testids or ids; do not touch web/tools/oracle/**, docs/,
  or frozen paths. Full `npx vitest run` + `npx tsc --noEmit` green.
- Do not regress the green set: BC-B-1, B-5, C-17, D-2 (+ cluster-2 outcomes)
  are re-checked in the same oracle run.

## Contract text (verbatim)

**BC-H-1** · assert · Backend unreachable → a legible, ANNOUNCED failure, never a
blank screen: "Could not load this dish …" renders with `role="alert"`, keyboard
focus lands on the error region or its "Back to dishes" control, and there is an
escape hatch. **[LIKELY FAILS TODAY — the error is a plain `<p>` and the
route-focus effect is gated on a loaded dish, so neither role nor focus fires on
this path]**
Check: load `/dishes/:id` with the server stopped (static shell served separately or
navigate then kill) → error card visible with `role="alert"` in the accessibility
tree, `document.activeElement` is the error region or "Back to dishes", no
uncaught exception in the console.

**BC-H-7** · assert · An unknown dish deep-link fails soft and audibly:
`/dishes/nope` renders the could-not-load card (role="alert", focus per BC-H-1's
pattern), not a crash or infinite spinner. **[LIKELY FAILS TODAY — same unmarked
plain-`<p>` code path as BC-H-1]**
Check: fast; navigate to a fabricated id → error card ≤ 3s with `role="alert"`
and focus on the error region or its escape hatch, console free of uncaught
errors.

**BC-H-8** · assert · The landing page degrades gracefully and audibly: when the
dish list fails to load on `/`, the failure message is announced to assistive
tech (`role="status"` or aria-live), and the seed form remains fully usable.
**[LIKELY FAILS TODAY — the failure message is a plain `<p>` with no live-region
role]**
Check: `/` with the backend unreachable for the list fetch → the failure message
renders with a live-region role in the accessibility tree; the seed form still
accepts input (submission requires the backend and is out of this scenario's
scope).

**BC-H-9** · assert · The initial dish-load wait is legible to assistive tech:
the "Loading the dish…" placeholder is exposed via `role="status"` (or an
equivalent live region), so an AT user is not left in silence between navigation
and the dish (or error card) rendering. **[LIKELY FAILS TODAY — the placeholder
is a bare `<div>`]**
Check: fast; navigate to `/dishes/:id` and sample the DOM before the GET
resolves → the loading text's container carries `role="status"` in the
accessibility tree.
