// API client for the pinned HTTP surface (spec §4): session-id minting,
// JSON plumbing, and the one persistent per-dish EventSource with
// auto-reconnect.
import type {
  CancelResponse, CreateDishRequest, DialResponse, DishDetail, DishSummary,
  GateRequestBody, GateResponse, MoveCancelledEvent, MoveFailedEvent,
  MoveResponse, PromoteResponse, ProposalBlockedEvent, ProposalReadyEvent,
  TokenEvent, VersionsResponse,
} from './types'

// --- session (spec §4 session rule: H2's frozen "session" unit) ---

const SESSION_KEY = 'capycook.session_id'
const SESSION_LAST_ACTIVE_KEY = 'capycook.session_last_active'
export const SESSION_IDLE_MS = 30 * 60 * 1000

function mintId(): string {
  const c = globalThis.crypto
  if (typeof c.randomUUID === 'function') return c.randomUUID()
  const b = new Uint8Array(16)
  c.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

// sessionId returns the crypto-random session id from sessionStorage,
// minting a fresh one on first use or after 30 minutes idle, and touches
// the idle clock. Every mutating request calls this, so activity keeps the
// session alive.
export function sessionId(now: number = Date.now()): string {
  const last = Number(sessionStorage.getItem(SESSION_LAST_ACTIVE_KEY) ?? '0')
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id || now - last > SESSION_IDLE_MS) id = mintId()
  sessionStorage.setItem(SESSION_KEY, id)
  sessionStorage.setItem(SESSION_LAST_ACTIVE_KEY, String(now))
  return id
}

// --- request plumbing ---

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function parse<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let msg = `HTTP ${r.status}`
    try {
      const body = (await r.json()) as { error?: string }
      if (body.error) msg = body.error
    } catch {
      // non-JSON error body: keep the status message
    }
    throw new ApiError(r.status, msg)
  }
  return r.json() as Promise<T>
}

async function get<T>(path: string): Promise<T> {
  return parse<T>(await fetch(path))
}

// send issues a mutating request: JSON body plus the X-Session-Id header
// every mutating request must carry (spec §4).
async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  return parse<T>(await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId() },
    body: body === undefined ? undefined : JSON.stringify(body),
  }))
}

// --- endpoints (spec §4 HTTP API) ---

export const listDishes = () =>
  get<DishSummary[]>('/api/dishes')

export const getDish = (id: string) =>
  get<DishDetail>(`/api/dishes/${id}`)

export const getVersions = (id: string) =>
  get<VersionsResponse>(`/api/dishes/${id}/versions`)

export const createDish = (req: CreateDishRequest) =>
  send<DishDetail>('POST', '/api/dishes', req)

export const setAutonomyDial = (id: string, on: boolean) =>
  send<DialResponse>('PATCH', `/api/dishes/${id}`, { autonomy_dial: on })

export const postMove = (id: string, moveType: string, steer: string) =>
  send<MoveResponse>('POST', `/api/dishes/${id}/move`, { moveType, steer })

export const postCancel = (id: string) =>
  send<CancelResponse>('POST', `/api/dishes/${id}/cancel`)

export const postGate = (id: string, body: GateRequestBody) =>
  send<GateResponse>('POST', `/api/dishes/${id}/gate`, body)

export const promoteVersion = (id: string, versionId: string) =>
  send<PromoteResponse>('POST', `/api/dishes/${id}/promote`, { versionId })

// --- SSE stream (spec §4: one persistent per-dish EventSource) ---

export interface DishStreamHandlers {
  onToken?: (e: TokenEvent) => void
  onProposalReady?: (e: ProposalReadyEvent) => void
  onProposalBlocked?: (e: ProposalBlockedEvent) => void
  onMoveCancelled?: (e: MoveCancelledEvent) => void
  onMoveFailed?: (e: MoveFailedEvent) => void
  // onReconnect fires when the stream re-opens after a drop; the caller
  // re-syncs state via GET /api/dishes/{id} (the stream carries no history).
  onReconnect?: () => void
}

const STREAM_RETRY_MS = 2000

// openDishStream opens the dish's EventSource and dispatches the five
// pinned SSE events. The browser retries a dropped connection itself; when
// the source lands fully closed, a fresh EventSource is created after a
// short delay. close() ends both.
export function openDishStream(dishId: string, h: DishStreamHandlers): { close: () => void } {
  let es: EventSource | null = null
  let closed = false
  let dropped = false
  let retry: ReturnType<typeof setTimeout> | null = null

  const connect = () => {
    if (closed) return
    es = new EventSource(`/api/dishes/${dishId}/stream`)
    es.onopen = () => {
      if (dropped) {
        dropped = false
        h.onReconnect?.()
      }
    }
    es.onerror = () => {
      dropped = true
      if (!closed && es && es.readyState === EventSource.CLOSED) {
        retry = setTimeout(connect, STREAM_RETRY_MS)
      }
    }
    const on = <T,>(name: string, fn?: (e: T) => void) => {
      es!.addEventListener(name, (ev) => {
        if (fn) fn(JSON.parse((ev as MessageEvent).data) as T)
      })
    }
    on<TokenEvent>('token', h.onToken)
    on<ProposalReadyEvent>('proposal-ready', h.onProposalReady)
    on<ProposalBlockedEvent>('proposal-blocked', h.onProposalBlocked)
    on<MoveCancelledEvent>('move-cancelled', h.onMoveCancelled)
    on<MoveFailedEvent>('move-failed', h.onMoveFailed)
  }
  connect()

  return {
    close: () => {
      closed = true
      if (retry) clearTimeout(retry)
      es?.close()
    },
  }
}
