import { SESSION_IDLE_MS, postMove, sessionId } from './api'
import { jsonResponse } from './fixtures'

beforeEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

test('session id is stable within the 30-minute idle window', () => {
  const a = sessionId(1_000)
  const b = sessionId(1_000 + 60_000)
  expect(b).toBe(a)
})

test('session id rotates after 30 minutes idle', () => {
  const a = sessionId(1_000)
  const b = sessionId(1_000 + SESSION_IDLE_MS + 1)
  expect(b).not.toBe(a)
})

test('activity inside the window keeps extending the session', () => {
  const a = sessionId(0)
  const b = sessionId(SESSION_IDLE_MS - 1)
  const c = sessionId(2 * SESSION_IDLE_MS - 2)
  expect(b).toBe(a)
  expect(c).toBe(a)
})

test('mutating requests carry X-Session-Id', async () => {
  const fetchMock = vi.fn(async () => jsonResponse({ moveId: 'mv_1' }))
  vi.stubGlobal('fetch', fetchMock)
  await postMove('d1', 'seed_expand', 'lean into thyme')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('/api/dishes/d1/move')
  const headers = init.headers as Record<string, string>
  expect(headers['X-Session-Id']).toBeTruthy()
  expect(JSON.parse(init.body as string)).toEqual({ moveType: 'seed_expand', steer: 'lean into thyme' })
})
