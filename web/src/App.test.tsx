import { render, screen, fireEvent } from '@testing-library/react'
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
