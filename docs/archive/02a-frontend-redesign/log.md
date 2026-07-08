# Log — 02a frontend-ia-redesign (rationale only)

**2026-07-07** — Direction A ("Line of Development") chosen by the user over B ("Cook's Notebook"); B is not built. The prototype's A/B switcher and Narrow toggle are prototype chrome, deliberately not implemented.

**2026-07-07** — Palette discrepancy between BUILD-SPEC.md and the dc.html resolved in favor of the dc.html (`--cc-add-bg` #E7F0E8). Small accent text deliberately uses the AA `--color-accent-text` token instead of the prototype's sub-AA raw accent at 11px — a11y is an acceptance criterion here.

**2026-07-08** — Recurring implementation trap: EVERY Tailwind scale in this project is replaced, not extended (spacing 0–9 on a 5px rhythm, fontWeight regular/medium/bold, lineHeight tight/ui/link/body/normal…). Default-scale classes like `min-h-8`, `leading-none`, `font-semibold` compile to nothing or to wrong values; pixel-exact design values must use bracket arbitrary classes. Bit three separate tasks before becoming a standing dispatch warning.

**2026-07-08** — Live-walk-only bug class: the intake form lacked `noValidate`, so native HTML5 min/step constraints blocked submit before the GOV.UK error summary could run. jsdom does not enforce native constraint validation, so the test suite could not catch it — found only by the puppeteer evidence run. Same run also surfaced a real Escape-key bug (Escape was gated behind the shortcuts-enabled flag).

**2026-07-08** — `proposing` state is unobservable in stub mode: the stub LLM resolves a move server-side in ~2–5 ms, faster than any client round trip, so the streaming card never appears. Genuine architecture, not a bug; the state renders with a real model. Evidence set documents 26/27 states.

**2026-07-08** — Intent bar sends `moveType: ''` (server-side auto classification) rather than porting the prototype's client-side keyword router — the router was mock-only; the wire contract already supported auto.
