import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SeedSetup, { validateSeedForm } from './SeedSetup'
import { dishDetail, jsonResponse } from '../fixtures'
import { BIG9_ALLERGENS } from '../types'

beforeEach(() => {
  sessionStorage.clear()
})

test('validateSeedForm returns field-scoped errors for an empty seed and non-positive servings', () => {
  const base = {
    seed: '', allergens: [], skill: 'beginner', servings: '2',
    dietary: '', equipment: '', onHand: '',
  }
  expect(validateSeedForm(base)).toEqual([{ field: 'seed', message: expect.stringMatching(/enter a seed/i) }])
  expect(validateSeedForm({ ...base, seed: 'stew', servings: '0' })).toEqual([
    { field: 'servings', message: expect.stringMatching(/servings/i) },
  ])
  expect(validateSeedForm({ ...base, seed: 'stew', servings: '2.5' })).toHaveLength(1)
  expect(validateSeedForm({ ...base, seed: 'stew', servings: '4' })).toHaveLength(0)
})

test('submitting an empty form shows an error summary and does not call the API', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  render(<SeedSetup onCreated={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /develop this dish/i }))
  const summary = await screen.findByRole('alert')
  expect(summary).toHaveTextContent(/there is a problem/i)
  expect(summary).toHaveTextContent(/enter a seed/i)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('the error summary receives focus on a failed submit', async () => {
  render(<SeedSetup onCreated={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /develop this dish/i }))
  const summary = await screen.findByRole('alert')
  expect(summary).toHaveFocus()
})

test('each summary error is a link that moves focus to its field', async () => {
  render(<SeedSetup onCreated={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /develop this dish/i }))
  const link = await screen.findByRole('link', { name: /enter a seed/i })
  expect(link).toHaveAttribute('href', '#field-seed')
  fireEvent.click(link)
  expect(screen.getByLabelText(/seed/i)).toHaveFocus()
})

test('fields with errors get aria-invalid and aria-describedby pointing at an inline message', async () => {
  render(<SeedSetup onCreated={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /develop this dish/i }))
  await screen.findByRole('alert')

  const seed = screen.getByLabelText(/seed/i)
  expect(seed).toHaveAttribute('aria-invalid', 'true')
  const describedby = seed.getAttribute('aria-describedby')
  expect(describedby).toBeTruthy()
  const inline = document.getElementById(describedby as string)
  expect(inline).toHaveTextContent(/enter a seed/i)
  // Inline messages are plain spans, not a second alert (multiple-alert trap).
  expect(inline).not.toHaveAttribute('role', 'alert')
  expect(screen.getAllByRole('alert')).toHaveLength(1)
})

test('renders all nine FDA Big-9 allergens as toggle buttons, all off by default', () => {
  render(<SeedSetup onCreated={() => {}} />)
  for (const a of BIG9_ALLERGENS) {
    const btn = screen.getByRole('button', { name: a })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-pressed', 'false')
  }
})

test('clicking an allergen button toggles its aria-pressed state', () => {
  render(<SeedSetup onCreated={() => {}} />)
  const peanuts = screen.getByRole('button', { name: 'peanuts' })
  fireEvent.click(peanuts)
  expect(peanuts).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(peanuts)
  expect(peanuts).toHaveAttribute('aria-pressed', 'false')
})

test('a valid form posts typed constraints and reports the created dish', async () => {
  const created = dishDetail({ id: 'd9' })
  const fetchMock = vi.fn(async () => jsonResponse(created, 201))
  vi.stubGlobal('fetch', fetchMock)
  const onCreated = vi.fn()
  render(<SeedSetup onCreated={onCreated} />)

  fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'a cozy chicken dinner' } })
  fireEvent.click(screen.getByRole('button', { name: 'milk' }))
  fireEvent.click(screen.getByRole('button', { name: 'peanuts' }))
  fireEvent.change(screen.getByLabelText(/skill/i), { target: { value: 'advanced' } })
  fireEvent.change(screen.getByLabelText(/servings/i), { target: { value: '4' } })
  fireEvent.change(screen.getByLabelText(/dietary/i), { target: { value: 'vegetarian, low sodium' } })
  fireEvent.change(screen.getByLabelText(/on hand/i), { target: { value: 'thyme' } })
  fireEvent.click(screen.getByRole('button', { name: /develop this dish/i }))

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('/api/dishes')
  expect((init.headers as Record<string, string>)['X-Session-Id']).toBeTruthy()
  const body = JSON.parse(init.body as string)
  expect(body.seed).toBe('a cozy chicken dinner')
  expect(body.constraints).toEqual({
    dietary: ['vegetarian', 'low sodium'],
    allergens: ['milk', 'peanuts'],
    equipment: [],
    skill: 'advanced',
    servings: 4,
    on_hand: ['thyme'],
    cuisine: 'western',
  })
})
