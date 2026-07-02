# Frontend / UI Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the frontend/UI strategy from `docs/superpowers/specs/2026-07-01-frontend-ui-strategy-design.md` — integrate the doc decisions, then build the **S0.4 walking skeleton**: a graybox two-pane workbench (React+Vite) served by the Go binary and runnable in a container.

**Architecture:** A Vite+React+TypeScript SPA in `web/` renders a hardcoded stub `Proposal` in the two-pane workbench and its four gate states. A Go package `web` embeds the built SPA (`//go:embed`) and serves it with SPA fallback; two stub JSON endpoints (`GET /api/proposal`, `POST /api/gate`) live in `cmd/server`, wired into the existing `newRouter()` beside `/healthz`. A multi-stage Dockerfile builds the SPA then the embedding binary. **Persistence (accept → eventlog) is deferred to Phase C — it depends on the S0.2 `eventlog`/`store` interfaces, which do not exist yet.**

**Tech Stack:** Go 1.26 (stdlib `net/http`, `embed`); React 18 + TypeScript + Vite; Tailwind CSS (shadcn/ui adopted later, per-slice); Vitest + @testing-library/react.

## Global Constraints

- Module path: `github.com/ogngnaoh/capycook` — copy verbatim in imports.
- Go: `1.26.4`; server stdlib only (`net/http` 1.22+ pattern routing, `log/slog`); no CGO (`CGO_ENABLED=0`).
- Frontend is **the low-stakes half** — graybox/low-fidelity only: gray boxes, labels, placeholder text. No final color/type, no imagery. Visual polish is per-slice, later.
- The walking skeleton proves the pipeline (UI → HTTP → Go → serve → Docker container), **not** features: no LLM, no grounding, no real move logic.
- Makefile recipes are tab-indented.
- Frontend build artifacts (`web/node_modules/`, `web/dist/` except `.gitkeep`) are gitignored; a committed `web/dist/.gitkeep` keeps `//go:embed all:dist` compilable on a fresh checkout.

---

## Phase A — Doc integration (no code; unblocked)

### Task 1: Apply the approved doc decisions

**Files:**
- Modify: `DESIGN.md` (§15 rollout table, ~lines 432–438)
- Modify: `CLAUDE.md` (Stack section, "Frontend (v2)" line)
- Modify: `docs/00-scaffold/handoff.md` (Slice status + Active concerns)

- [ ] **Step 1: Amend `DESIGN.md` §15.** Read the current v0/v1/v2 rows, then edit in place:
  - **v0 goal** — append to the goal cell: `; stand up the walking skeleton (S0.4): thin UI → Go-served → containerized`. **v0 exit** — append: `; the walking skeleton serves a graybox workbench from the Go binary in a container`.
  - **v1 goal** — append to the goal cell: `; build the two-pane workbench UI as the loop's interaction surface`.
  - **v2 goal** — replace `provenance/safety UI; deploy` with `provenance/safety overlays on the existing workbench; deploy hardening + eval-results surface (P0-11 re-scoped from "the frontend" to overlays, since the workbench ships in v1)`.

- [ ] **Step 2: Update `CLAUDE.md` Stack line.** Change `- Frontend (v2): React + Vite in \`web/\` (placeholder for now).` to `- Frontend: React + Vite + Tailwind in \`web/\`; graybox workbench skeleton (S0.4), styled per-slice thereafter (see docs/superpowers/specs/2026-07-01-frontend-ui-strategy-design.md).`

- [ ] **Step 3: Update `docs/00-scaffold/handoff.md`.** Under "Slice status across milestone" add: `- S0.4 walking-skeleton (graybox workbench · serve · Docker) → planned`. Remove the now-stale Active-concern bullet about S0.1 being on branch `s0.1-scaffold` (its commits are on `master`).

- [ ] **Step 4: Verify.**

Run: `grep -n "walking skeleton" DESIGN.md CLAUDE.md docs/00-scaffold/handoff.md`
Expected: at least one hit in each file.

- [ ] **Step 5: Commit**

```bash
git add DESIGN.md CLAUDE.md docs/00-scaffold/handoff.md
git commit -m "docs: integrate frontend/UI strategy — DESIGN §15 amendment + S0.4 slice"
```

---

## Phase B — Walking skeleton: serve/build/deploy leg (unblocked)

### Task 2: Scaffold the Vite + React + TS + Tailwind + Vitest toolchain

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/index.html`, `web/postcss.config.js`, `web/tailwind.config.js`, `web/src/main.tsx`, `web/src/index.css`, `web/src/App.tsx`, `web/src/vitest.setup.ts`, `web/dist/.gitkeep`
- Modify: `.gitignore`
- Test: `web/src/App.test.tsx`

**Interfaces:**
- Produces: `App` default export (React component) rendering a root `<main data-testid="app-root">`; a working `npm run build` → `web/dist/` and `npm run test`.

- [ ] **Step 1: Write `web/package.json`**

```json
{
  "name": "capycook-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.45",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4",
    "vite": "^5.4.3",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write the config files**

`web/vite.config.ts` — dev server proxies `/api` and `/healthz` to the Go server on :8080, and configures Vitest:
```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/vitest.setup.ts'],
  },
})
```

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "useDefineForClassFields": true, "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext", "skipLibCheck": true, "moduleResolution": "bundler",
    "resolveJsonModule": true, "isolatedModules": true, "noEmit": true, "jsx": "react-jsx",
    "strict": true, "noUnusedLocals": true, "noUnusedParameters": true, "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`web/tsconfig.node.json`:
```json
{
  "compilerOptions": { "composite": true, "skipLibCheck": true, "module": "ESNext", "moduleResolution": "bundler", "allowSyntheticDefaultImports": true },
  "include": ["vite.config.ts"]
}
```

`web/postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

`web/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default { content: ['./index.html', './src/**/*.{ts,tsx}'], theme: { extend: {} }, plugins: [] }
```

`web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>CapyCook</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

`web/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`web/src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
```

`web/src/vitest.setup.ts`:
```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Write the failing smoke test** `web/src/App.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

test('renders the app root', () => {
  render(<App />)
  expect(screen.getByTestId('app-root')).toBeInTheDocument()
})
```

- [ ] **Step 4: Install deps and run the test to verify it fails**

Run: `cd web && npm install && npm run test`
Expected: FAIL — `App` module has no default export / file missing.

- [ ] **Step 5: Write minimal `web/src/App.tsx`**

```tsx
export default function App() {
  return <main data-testid="app-root" className="min-h-screen bg-gray-100 text-gray-900" />
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd web && npm run test`
Expected: PASS (1 test).

- [ ] **Step 7: Create `web/dist/.gitkeep`** (empty file) and update `.gitignore` — append:
```
# frontend
web/node_modules/
web/dist/*
!web/dist/.gitkeep
```

- [ ] **Step 8: Verify the production build works**

Run: `cd web && npm run build`
Expected: exit 0; `web/dist/index.html` produced.

- [ ] **Step 9: Commit**

```bash
git add web/ .gitignore
git commit -m "feat(web): scaffold Vite+React+TS+Tailwind toolchain with a smoke test"
```

### Task 3: The two signature components — `ProposalCard` and `GateBar`

**Files:**
- Create: `web/src/types.ts`, `web/src/components/ProposalCard.tsx`, `web/src/components/GateBar.tsx`
- Test: `web/src/components/ProposalCard.test.tsx`, `web/src/components/GateBar.test.tsx`

**Interfaces:**
- Produces: `type Proposal` and `type GateVerb`; `<ProposalCard proposal={Proposal} />`; `<GateBar onVerb={(v: GateVerb) => void} disabled?={boolean} />`.

- [ ] **Step 1: Write `web/src/types.ts`** (the user-facing Proposal contract, spec §3c)

```ts
export type GateVerb = 'accept' | 'edit' | 'regenerate' | 'alternatives' | 'redirect' | 'takeover'

export interface Citation { source: string; ref: string }

export interface Proposal {
  id: string
  diff: { op: 'add' | 'remove' | 'replace'; path: string; value: string }[]
  rationale: string
  citations: Citation[]
  confidence: number
  unverified: string[]
  safetyBlock: string | null
}
```

- [ ] **Step 2: Write failing test** `web/src/components/ProposalCard.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import ProposalCard from './ProposalCard'
import type { Proposal } from '../types'

const stub: Proposal = {
  id: 'p1', diff: [{ op: 'add', path: 'ingredients', value: '2 cloves garlic' }],
  rationale: 'Depth.', citations: [{ source: 'USDA FDC', ref: '11215' }],
  confidence: 0.72, unverified: ['cook time is an estimate'], safetyBlock: null,
}

test('renders diff, a citation, confidence, and an [unverified] flag', () => {
  render(<ProposalCard proposal={stub} />)
  expect(screen.getByText(/2 cloves garlic/)).toBeInTheDocument()
  expect(screen.getByText(/USDA FDC/)).toBeInTheDocument()
  expect(screen.getByText(/72%/)).toBeInTheDocument()
  expect(screen.getByText(/\[unverified\]/)).toBeInTheDocument()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npm run test -- ProposalCard`
Expected: FAIL — cannot find `./ProposalCard`.

- [ ] **Step 4: Write `web/src/components/ProposalCard.tsx`**

```tsx
import type { Proposal } from '../types'

export default function ProposalCard({ proposal }: { proposal: Proposal }) {
  return (
    <div className="border border-gray-300 rounded p-3 space-y-2 bg-white">
      <div className="font-mono text-sm">
        {proposal.diff.map((d, i) => (
          <div key={i} className="text-green-700">+ {d.path}: {d.value}</div>
        ))}
      </div>
      <p className="text-sm text-gray-700">{proposal.rationale}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        {proposal.citations.map((c, i) => (
          <span key={i} className="px-2 py-0.5 bg-gray-200 rounded">{c.source} #{c.ref}</span>
        ))}
        <span className="px-2 py-0.5 bg-gray-200 rounded">conf {Math.round(proposal.confidence * 100)}%</span>
        {proposal.unverified.map((u, i) => (
          <span key={i} className="px-2 py-0.5 bg-yellow-200 rounded">[unverified] {u}</span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npm run test -- ProposalCard`
Expected: PASS.

- [ ] **Step 6: Write failing test** `web/src/components/GateBar.test.tsx`

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import GateBar from './GateBar'

test('renders all six verbs and fires onVerb', () => {
  const calls: string[] = []
  render(<GateBar onVerb={(v) => calls.push(v)} />)
  for (const label of ['Accept', 'Edit', 'Regenerate', 'Alternatives', 'Redirect', 'Take over']) {
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  }
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  expect(calls).toEqual(['accept'])
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd web && npm run test -- GateBar`
Expected: FAIL — cannot find `./GateBar`.

- [ ] **Step 8: Write `web/src/components/GateBar.tsx`**

```tsx
import type { GateVerb } from '../types'

const VERBS: { verb: GateVerb; label: string }[] = [
  { verb: 'accept', label: 'Accept' }, { verb: 'edit', label: 'Edit' },
  { verb: 'regenerate', label: 'Regenerate' }, { verb: 'alternatives', label: 'Alternatives' },
  { verb: 'redirect', label: 'Redirect' }, { verb: 'takeover', label: 'Take over' },
]

export default function GateBar({ onVerb, disabled }: { onVerb: (v: GateVerb) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-gray-300 pt-2">
      {VERBS.map(({ verb, label }) => (
        <button key={verb} disabled={disabled} onClick={() => onVerb(verb)}
          className="px-3 py-1 text-sm rounded bg-gray-800 text-white disabled:opacity-40">{label}</button>
      ))}
    </div>
  )
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd web && npm run test -- GateBar`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add web/src/types.ts web/src/components/
git commit -m "feat(web): ProposalCard + GateBar signature components (TDD)"
```

### Task 4: Two-pane `Workbench`, the four gate states, and the API data layer

**Files:**
- Create: `web/src/api.ts`, `web/src/components/DraftPane.tsx`, `web/src/components/SteeringPane.tsx`, `web/src/components/Workbench.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/components/Workbench.test.tsx`, `web/src/App.test.tsx`

**Interfaces:**
- Consumes: `Proposal`, `GateVerb` (Task 3); `ProposalCard`, `GateBar`.
- Produces: `type GateState = 'proposing' | 'blocked' | 'awaiting' | 'accepted'`; `fetchProposal(): Promise<Proposal>`; `postGate(id: string, verb: GateVerb): Promise<{ ok: boolean }>`; `<Workbench proposal state onVerb />`.

- [ ] **Step 1: Write `web/src/api.ts`**

```ts
import type { Proposal, GateVerb } from './types'

export async function fetchProposal(): Promise<Proposal> {
  const r = await fetch('/api/proposal')
  if (!r.ok) throw new Error(`proposal ${r.status}`)
  return r.json()
}

export async function postGate(id: string, verb: GateVerb): Promise<{ ok: boolean }> {
  const r = await fetch('/api/gate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposalId: id, verb }),
  })
  if (!r.ok) throw new Error(`gate ${r.status}`)
  return r.json()
}
```

- [ ] **Step 2: Write failing test** `web/src/components/Workbench.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import Workbench, { type GateState } from './Workbench'
import type { Proposal } from '../types'

const stub: Proposal = {
  id: 'p1', diff: [{ op: 'add', path: 'ingredients', value: '2 cloves garlic' }],
  rationale: 'Depth.', citations: [], confidence: 0.7, unverified: [], safetyBlock: null,
}

test.each<[GateState, RegExp]>([
  ['proposing', /Proposing/], ['blocked', /Blocked/], ['awaiting', /Awaiting gate/], ['accepted', /Accepted/],
])('shows the %s state banner', (state, re) => {
  render(<Workbench proposal={stub} state={state} onVerb={() => {}} />)
  expect(screen.getByText(re)).toBeInTheDocument()
})

test('two panes are present', () => {
  render(<Workbench proposal={stub} state="awaiting" onVerb={() => {}} />)
  expect(screen.getByTestId('draft-pane')).toBeInTheDocument()
  expect(screen.getByTestId('steering-pane')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd web && npm run test -- Workbench`
Expected: FAIL — cannot find `./Workbench`.

- [ ] **Step 4: Write the pane + workbench components**

`web/src/components/DraftPane.tsx`:
```tsx
import type { Proposal } from '../types'
import ProposalCard from './ProposalCard'

export default function DraftPane({ proposal }: { proposal: Proposal }) {
  return (
    <section data-testid="draft-pane" className="flex-1 p-4 border-r border-gray-300 space-y-3">
      <h2 className="text-xs uppercase tracking-wide text-gray-500">Draft</h2>
      <div className="p-3 bg-white border border-gray-200 rounded text-sm text-gray-400">[dish draft placeholder]</div>
      <ProposalCard proposal={proposal} />
    </section>
  )
}
```

`web/src/components/SteeringPane.tsx`:
```tsx
export default function SteeringPane({ rationale }: { rationale: string }) {
  return (
    <section data-testid="steering-pane" className="w-96 p-4 space-y-3">
      <h2 className="text-xs uppercase tracking-wide text-gray-500">Steering</h2>
      <div className="p-3 bg-white border border-gray-200 rounded text-sm">{rationale}</div>
    </section>
  )
}
```

`web/src/components/Workbench.tsx`:
```tsx
import type { Proposal, GateVerb } from '../types'
import DraftPane from './DraftPane'
import SteeringPane from './SteeringPane'
import GateBar from './GateBar'

export type GateState = 'proposing' | 'blocked' | 'awaiting' | 'accepted'

const BANNER: Record<GateState, string> = {
  proposing: 'Proposing…', blocked: 'Blocked by safety gate',
  awaiting: 'Awaiting gate', accepted: 'Accepted',
}

export default function Workbench(
  { proposal, state, onVerb }: { proposal: Proposal; state: GateState; onVerb: (v: GateVerb) => void },
) {
  return (
    <div className="flex flex-col h-screen">
      <div className="px-4 py-2 bg-gray-800 text-white text-sm">CapyCook — {BANNER[state]}</div>
      <div className="flex flex-1 overflow-hidden">
        <DraftPane proposal={proposal} />
        <SteeringPane rationale={proposal.rationale} />
      </div>
      <div className="p-4"><GateBar onVerb={onVerb} disabled={state !== 'awaiting'} /></div>
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && npm run test -- Workbench`
Expected: PASS.

- [ ] **Step 6: Rewrite `web/src/App.test.tsx`** to assert the wired app fetches and shows a proposal

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'
import type { Proposal } from './types'

const stub: Proposal = {
  id: 'p1', diff: [{ op: 'add', path: 'ingredients', value: '2 cloves garlic' }],
  rationale: 'Depth.', citations: [], confidence: 0.7, unverified: [], safetyBlock: null,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => stub })) as unknown as typeof fetch)
})

test('loads a proposal into the workbench', async () => {
  render(<App />)
  await waitFor(() => expect(screen.getByText(/2 cloves garlic/)).toBeInTheDocument())
  expect(screen.getByTestId('draft-pane')).toBeInTheDocument()
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd web && npm run test -- App`
Expected: FAIL — App renders no draft-pane yet.

- [ ] **Step 8: Rewrite `web/src/App.tsx`** to wire fetch → workbench + a dev state toggle

```tsx
import { useEffect, useState } from 'react'
import type { Proposal, GateVerb } from './types'
import { fetchProposal, postGate } from './api'
import Workbench, { type GateState } from './components/Workbench'

const STATES: GateState[] = ['proposing', 'blocked', 'awaiting', 'accepted']

export default function App() {
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [state, setState] = useState<GateState>('awaiting')

  useEffect(() => { fetchProposal().then(setProposal).catch(() => {}) }, [])

  async function onVerb(v: GateVerb) {
    if (!proposal) return
    if (v === 'accept') { await postGate(proposal.id, v).catch(() => {}); setState('accepted') }
  }

  if (!proposal) return <main data-testid="app-root" className="min-h-screen bg-gray-100 p-4">Loading…</main>

  return (
    <main data-testid="app-root" className="min-h-screen bg-gray-100">
      <Workbench proposal={proposal} state={state} onVerb={onVerb} />
      <div className="fixed bottom-2 right-2 flex gap-1 text-xs">
        {STATES.map((s) => (
          <button key={s} onClick={() => setState(s)} className="px-2 py-1 bg-white border rounded">{s}</button>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd web && npm run test`
Expected: PASS (all suites).

- [ ] **Step 10: Commit**

```bash
git add web/src/
git commit -m "feat(web): two-pane Workbench, four gate states, API data layer (TDD)"
```

### Task 5: Go — embed the built SPA and serve it with SPA fallback

**Files:**
- Create: `web/embed.go`, `web/serve.go`, `web/serve_test.go`

**Interfaces:**
- Produces: package `web` with `Assets embed.FS` (embeds `dist`) and `func Handler() http.Handler` — serves embedded files, falling back to `dist/index.html` for non-`/api`, non-`/healthz` GETs.

- [ ] **Step 1: Write `web/embed.go`**

```go
// Package web embeds the built Vite SPA (web/dist) and serves it. The dist
// directory is a build artifact; web/dist/.gitkeep keeps this compilable on a
// fresh checkout before `make web` runs.
package web

import "embed"

//go:embed all:dist
var Assets embed.FS
```

- [ ] **Step 2: Write failing test** `web/serve_test.go`

```go
package web

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandlerServesEmbeddedFile(t *testing.T) {
	srv := httptest.NewServer(Handler())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/.gitkeep")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("want 200 for an embedded file, got %d", resp.StatusCode)
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `go test ./web/`
Expected: FAIL — `Handler` undefined.

- [ ] **Step 4: Write `web/serve.go`**

```go
package web

import (
	"io/fs"
	"net/http"
	"strings"
)

// Handler serves the embedded SPA. Real files are served directly; any other
// GET (that is not an API or health route) falls back to index.html so the SPA
// can client-route. Returns 404 for index.html when only .gitkeep is embedded.
func Handler() http.Handler {
	sub, err := fs.Sub(Assets, "dist")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(sub))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(sub, p); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}
		// SPA fallback
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/index.html"
		fileServer.ServeHTTP(w, r2)
	})
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `go test ./web/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/embed.go web/serve.go web/serve_test.go
git commit -m "feat(web): Go embed + SPA-fallback static handler (TDD)"
```

### Task 6: Go — stub `/api/proposal` and `/api/gate`, wired into the router

**Files:**
- Create: `cmd/server/api.go`, `cmd/server/api_test.go`
- Modify: `cmd/server/main.go` (`newRouter`)

**Interfaces:**
- Consumes: `web.Handler()` (Task 5).
- Produces: `handleProposal(http.ResponseWriter, *http.Request)` returns the stub `Proposal` JSON; `handleGate(...)` accepts `{proposalId, verb}` and returns `{"ok":true}`. `newRouter` serves `/api/*` + the embedded SPA for everything else.

- [ ] **Step 1: Write failing test** `cmd/server/api_test.go`

```go
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProposalEndpointReturnsStub(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/proposal", nil)
	rec := httptest.NewRecorder()
	newRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["id"] == "" || body["id"] == nil {
		t.Fatalf("expected a proposal id, got %v", body["id"])
	}
}

func TestGateEndpointAcceptsVerb(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/gate", strings.NewReader(`{"proposalId":"stub-1","verb":"accept"}`))
	rec := httptest.NewRecorder()
	newRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"ok":true`) {
		t.Fatalf("want ok:true, got %s", rec.Body.String())
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./cmd/server/`
Expected: FAIL — routes 404 (handlers not wired).

- [ ] **Step 3: Write `cmd/server/api.go`**

```go
package main

import (
	"encoding/json"
	"net/http"
)

// stubProposal is the hardcoded walking-skeleton proposal (S0.4). The real
// proposal contract lands with internal/proposal in milestone 01.
const stubProposal = `{
  "id": "stub-1",
  "diff": [{"op":"add","path":"ingredients","value":"2 cloves garlic, minced"}],
  "rationale": "Garlic deepens the aromatic base; bloomed in oil before the liquid goes in.",
  "citations": [{"source":"USDA FDC","ref":"11215"}],
  "confidence": 0.72,
  "unverified": ["cook time is an estimate"],
  "safetyBlock": null
}`

func handleProposal(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(stubProposal))
}

func handleGate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ProposalID string `json:"proposalId"`
		Verb       string `json:"verb"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Verb == "" {
		http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
		return
	}
	// Phase C (blocked on S0.2): persist an accept event via internal/eventlog here.
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"ok":true}`))
}
```

- [ ] **Step 4: Wire routes in `cmd/server/main.go`.** Add the import `"github.com/ogngnaoh/capycook/web"`, then extend `newRouter` (keep `GET /healthz`):

```go
	mux.HandleFunc("GET /api/proposal", handleProposal)
	mux.HandleFunc("POST /api/gate", handleGate)
	mux.Handle("/", web.Handler())
```

- [ ] **Step 5: Run test to verify it passes**

Run: `go test ./cmd/server/`
Expected: PASS (existing `/healthz` test + the two new ones).

- [ ] **Step 6: Full check + commit**

Run: `go vet ./... && go test ./...`
Expected: PASS.
```bash
git add cmd/server/api.go cmd/server/api_test.go cmd/server/main.go
git commit -m "feat(server): stub /api/proposal + /api/gate, serve embedded SPA"
```

### Task 7: Multi-stage Docker build + Makefile web targets

**Files:**
- Modify: `Dockerfile`, `Makefile`

**Interfaces:**
- Produces: `make web` builds the SPA into `web/dist`; `docker build` produces an image whose container serves `/`, `/healthz`, and `/api/proposal`.

- [ ] **Step 1: Add Makefile targets.** Add `web` to `.PHONY`, and:

```make
web:
	cd web && npm ci && npm run build

build-all: web build
```

- [ ] **Step 2: Rewrite the `Dockerfile`** so the SPA is built first and embedded by the Go build

```dockerfile
# syntax=docker/dockerfile:1

# --- Stage 1: build the Vite SPA into web/dist ---
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ .
RUN npm run build

# --- Stage 2: static Go binary embedding the built SPA (CGO_ENABLED=0) ---
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
COPY --from=web /web/dist ./web/dist
RUN CGO_ENABLED=0 go build -o /out/capycook ./cmd/server

# --- Stage 3: minimal nonroot runtime ---
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/capycook /capycook
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/capycook"]
```

- [ ] **Step 3: Build the SPA and the binary locally**

Run: `make web && make build`
Expected: exit 0; `web/dist/index.html` and `bin/capycook` produced.

- [ ] **Step 4: Verify the local binary serves the app**

Run: `PORT=8080 ./bin/capycook & sleep 1; curl -sf localhost:8080/healthz && curl -sf localhost:8080/api/proposal | grep -q stub-1 && curl -sf localhost:8080/ | grep -qi '<div id="root">' && echo SERVE_OK; kill %1`
Expected: `SERVE_OK`.

- [ ] **Step 5: Build the container and verify it serves**

Run: `docker build -t capycook:dev . && docker run -d --rm -p 8081:8080 --name capy capycook:dev && sleep 1 && curl -sf localhost:8081/api/proposal | grep -q stub-1 && echo CONTAINER_OK; docker stop capy`
Expected: `CONTAINER_OK`.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile Makefile
git commit -m "build: multi-stage Docker (Vite build → embed → nonroot runtime) + make web"
```

---

## Phase C — Persistence leg (DEFERRED — blocked on S0.2)

**Not scheduled in this plan.** The walking skeleton's final architectural leg — persisting an accept as an append-only event — depends on the `internal/eventlog` and `internal/store` interfaces, which are S0.2 deliverables and do not exist yet. Writing TDD code for it now would invent types S0.2 must define (a plan-failure per the no-placeholders rule).

**Integration seam already staged:** `handleGate` in `cmd/server/api.go` carries the comment marking where the `eventlog.Append(...)` call goes. When S0.2 lands, add one task: on `verb == "accept"`, append a gate event and return it in the `/api/gate` response; extend `TestGateEndpointAcceptsVerb` to assert the event was persisted. Fold this into the S0.2 plan or a short follow-up plan then.

---

## Self-Review

**Spec coverage** (against `2026-07-01-frontend-ui-strategy-design.md`):
- §2 thin-direction principle → embodied by the graybox constraint + per-slice deferral (Global Constraints, Task 1 CLAUDE.md line).
- §3a workbench map screens/states → Task 4 (two panes + four states). Seed-setup screen is **out of scope for the skeleton** (the skeleton opens directly on the workbench with a stub proposal); it lands with milestone 01 — noted here as a deliberate exclusion, not a gap.
- §3b design language (Tailwind, 3 signature components) → Tasks 2–3 (Tailwind; ProposalCard, GateBar; the citation/`[unverified]`/confidence chip in ProposalCard).
- §3c Proposal contract → `web/src/types.ts` (Task 3) + `stubProposal` (Task 6), kept consistent.
- §4 hand-off (rebuild against real backend, not artifact React) → this plan *is* the in-repo build; no artifact code imported.
- §5 S0.4 serve/build/deploy leg → Tasks 5–7; persistence leg → Phase C (deferred, seam staged).
- §6 DESIGN §15 amendment → Task 1.
- §7 non-goals → honored (no hi-fi, no v2/v3 surfaces, no final color, no eval/results screen).

**Placeholder scan:** No "TBD/TODO" in executable tasks. Phase C is explicitly deferred with rationale, not a placeholder task. The `handleGate` comment is a staged seam, not a code placeholder.

**Type consistency:** `Proposal`/`GateVerb`/`Citation` defined once in `web/src/types.ts` and reused in ProposalCard, GateBar, Workbench, api.ts, App. The stub JSON in `stubProposal` (Go) matches the `Proposal` TS shape field-for-field (`id, diff[op,path,value], rationale, citations[source,ref], confidence, unverified, safetyBlock`). `GateState` defined once in Workbench.tsx, imported by App.
