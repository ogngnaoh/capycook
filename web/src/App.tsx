import { useEffect, useState } from 'react'
import type { DishSummary } from './types'
import { listDishes } from './api'
import SeedSetup from './screens/SeedSetup'
import Workbench from './components/Workbench'

// App owns URL-per-dish routing via the History API (no router dependency):
// '/' is the seed screen + recent dishes, '/dishes/:id' the workbench.
export default function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function navigate(to: string) {
    window.history.pushState({}, '', to)
    setPath(to)
  }

  const dish = path.match(/^\/dishes\/([^/]+)$/)
  return (
    <main data-testid="app-root" className="min-h-screen bg-page text-ink">
      {dish
        ? <Workbench key={dish[1]} dishId={dish[1]} onNavigate={navigate} />
        : <Home onNavigate={navigate} />}
    </main>
  )
}

function Home({ onNavigate }: { onNavigate: (to: string) => void }) {
  const [dishes, setDishes] = useState<DishSummary[]>([])
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    listDishes().then(setDishes).catch(() => setLoadError(true))
  }, [])

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5">
      <header className="h-header flex items-center border-b border-hairline">
        <h1 className="uppercase font-medium text-sm">
          CapyCook <span className="text-muted font-regular">— dish development workbench</span>
        </h1>
      </header>
      <SeedSetup onCreated={(d) => onNavigate(`/dishes/${d.id}`)} />
      <section className="space-y-2">
        <h2 className="uppercase text-muted">Recent dishes</h2>
        {loadError && (
          <p className="text-muted">The dish list did not load — check the server and refresh.</p>
        )}
        {!loadError && dishes.length === 0 && (
          <p className="text-muted">No dishes yet — start one above.</p>
        )}
        {dishes.length > 0 && (
          <ul className="border-t border-hairline">
            {dishes.map((d) => (
              <li key={d.id}>
                <button onClick={() => onNavigate(`/dishes/${d.id}`)}
                  className="w-full text-left px-2 py-2 border-b border-x border-hairline bg-page transition hover:bg-surface flex justify-between gap-2">
                  <span className="truncate text-ink">{d.title}</span>
                  <span className="font-mono text-2xs text-muted shrink-0">{new Date(d.updated_at).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
