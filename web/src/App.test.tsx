import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import { MockEventSource, dishDetail, jsonResponse } from './fixtures'

beforeEach(() => {
  sessionStorage.clear()
  MockEventSource.reset()
  vi.stubGlobal('EventSource', MockEventSource)
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes') {
      return jsonResponse([{ id: 'd1', title: 'Stew', updated_at: '2026-07-06T00:00:00Z' }])
    }
    if (url === '/api/dishes/d1') return jsonResponse(dishDetail())
    return jsonResponse({})
  }))
})

test('home shows the seed screen and recent dishes; clicking one routes to /dishes/:id', async () => {
  window.history.pushState({}, '', '/')
  render(<App />)
  expect(screen.getByLabelText(/seed/i)).toBeInTheDocument()
  fireEvent.click(await screen.findByText('Stew'))
  expect(window.location.pathname).toBe('/dishes/d1')
  expect((await screen.findAllByText('Seared Chicken Thighs')).length).toBeGreaterThan(0)
})

test('a direct /dishes/:id URL mounts the workbench for that dish', async () => {
  window.history.pushState({}, '', '/dishes/d1')
  render(<App />)
  expect((await screen.findAllByText('Seared Chicken Thighs')).length).toBeGreaterThan(0)
  expect(MockEventSource.instances[0]?.url).toBe('/api/dishes/d1/stream')
})

test('document.title tracks the route: CapyCook on home, dish-scoped on the workbench', async () => {
  window.history.pushState({}, '', '/')
  render(<App />)
  await waitFor(() => expect(document.title).toBe('CapyCook'))
  fireEvent.click(await screen.findByText('Stew'))
  await waitFor(() => expect(document.title).toBe('Seared Chicken Thighs — CapyCook'))
})

test('a failed dish-list load is announced via a live region; the seed form stays usable', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes') return jsonResponse({ error: 'unreachable' }, 502)
    return jsonResponse({})
  }))
  window.history.pushState({}, '', '/')
  render(<App />)
  const msg = await screen.findByRole('status')
  expect(msg).toHaveTextContent('The dish list did not load — check the server and refresh.')
  // The failure degrades gracefully: the seed form still accepts input.
  const seed = screen.getByLabelText(/seed/i)
  fireEvent.change(seed, { target: { value: 'a bright summer soup' } })
  expect(seed).toHaveValue('a bright summer soup')
})

test('a route change focuses the destination screen h1; a cold load does not', async () => {
  // Cold load: the workbench h1 exists but must not have stolen focus.
  window.history.pushState({}, '', '/dishes/d1')
  render(<App />)
  const dishHeading = await screen.findByRole('heading', { level: 1, name: /seared chicken thighs/i })
  expect(dishHeading).not.toHaveFocus()
  // Navigating home is a route change → focus lands on the home h1.
  fireEvent.click(screen.getByRole('button', { name: 'Dishes' }))
  const homeHeading = await screen.findByRole('heading', { level: 1, name: /capycook/i })
  await waitFor(() => expect(homeHeading).toHaveFocus())
})
