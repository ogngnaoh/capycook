import { useEffect, useRef, useState } from 'react'
import type { DishSummary } from './types'
import { listDishes } from './api'
import SeedSetup from './screens/SeedSetup'
import Workbench from './components/Workbench'

// App owns URL-per-dish routing via the History API (no router dependency):
// '/' is the seed screen + recent dishes, '/dishes/:id' the workbench.
export default function App() {
  const [path, setPath] = useState(window.location.pathname)
  // routeNonce bumps on every route change (programmatic navigate + Back/
  // Forward) so the destination screen focuses its <h1> on a route change but
  // never on a cold load — SPA client-side-routing focus management (audit #9).
  const [routeNonce, setRouteNonce] = useState(0)

  useEffect(() => {
    const onPop = () => { setPath(window.location.pathname); setRouteNonce((n) => n + 1) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function navigate(to: string) {
    window.history.pushState({}, '', to)
    setPath(to)
    setRouteNonce((n) => n + 1)
  }

  const dish = path.match(/^\/dishes\/([^/]+)$/)
  // Not a landmark itself — each screen owns its own <header>/<main>, so the
  // workbench header sits OUTSIDE <main> (audit #9), which a wrapping <main>
  // here would violate.
  return (
    <div data-testid="app-root" className="min-h-screen bg-page text-ink">
      {dish
        ? <Workbench key={dish[1]} dishId={dish[1]} onNavigate={navigate} routeNonce={routeNonce} />
        : <Home onNavigate={navigate} routeNonce={routeNonce} />}
    </div>
  )
}

function Home({ onNavigate, routeNonce }: { onNavigate: (to: string) => void; routeNonce: number }) {
  const [dishes, setDishes] = useState<DishSummary[]>([])
  const [loadError, setLoadError] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    listDishes().then(setDishes).catch(() => setLoadError(true))
  }, [])

  // The home screen owns the plain document title; the workbench owns the
  // per-dish title.
  useEffect(() => { document.title = 'CapyCook' }, [])

  // Route-change focus: land on the screen's h1 when the cook navigated here,
  // never on a cold load (routeNonce === 0).
  useEffect(() => {
    if (routeNonce > 0) headingRef.current?.focus()
  }, [routeNonce])

  return (
    <div className="max-w-3xl mx-auto px-4 pt-6 pb-8 space-y-6">
      <header className="h-header flex items-center border-b border-hairline">
        <h1 ref={headingRef} tabIndex={-1} className="uppercase font-medium text-sm focus:outline-none">
          CapyCook <span className="text-muted font-regular">— dish development workbench</span>
        </h1>
      </header>
      <main className="space-y-6">
        <SeedSetup onCreated={(d) => onNavigate(`/dishes/${d.id}`)} />
        <section aria-labelledby="recent-dishes-heading" className="space-y-3 border-t border-hairline pt-5">
          <h2 id="recent-dishes-heading" className="text-2xs uppercase tracking-ui text-muted">
            Pick up where you left off
          </h2>
          {loadError && (
            <p className="text-muted">The dish list did not load — check the server and refresh.</p>
          )}
          {!loadError && dishes.length === 0 && (
            <p className="text-muted">No dishes yet — start one above.</p>
          )}
          {dishes.length > 0 && (
            <ul className="space-y-2">
              {dishes.map((d) => (
                <li key={d.id}>
                  <button onClick={() => onNavigate(`/dishes/${d.id}`)}
                    className="w-full min-h-[44px] flex items-center justify-between gap-4 border border-hairline-strong bg-panel px-4 py-3 text-left transition hover:bg-surface">
                    <span className="truncate font-medium text-ink">{d.title}</span>
                    <span className="font-mono text-2xs text-faint shrink-0">{new Date(d.updated_at).toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
