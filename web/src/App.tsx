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
    <main data-testid="app-root" className="min-h-screen bg-gray-100">
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
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-gray-900">CapyCook — Dish Development Workbench</h1>
      </header>
      <SeedSetup onCreated={(d) => onNavigate(`/dishes/${d.id}`)} />
      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-gray-500">Recent dishes</h2>
        {loadError && <p className="text-sm text-gray-500">Could not load recent dishes.</p>}
        {!loadError && dishes.length === 0 && (
          <p className="text-sm text-gray-400">No dishes yet — start one above.</p>
        )}
        {dishes.length > 0 && (
          <ul className="divide-y divide-gray-200 bg-white border border-gray-200 rounded">
            {dishes.map((d) => (
              <li key={d.id}>
                <button onClick={() => onNavigate(`/dishes/${d.id}`)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between gap-2">
                  <span className="truncate">{d.title}</span>
                  <span className="text-xs text-gray-400 shrink-0">{new Date(d.updated_at).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
