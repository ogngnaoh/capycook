import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SeedSetup, { validateSeedForm } from './SeedSetup'
import { dishDetail, jsonResponse } from '../fixtures'
import { BIG9_ALLERGENS } from '../types'

beforeEach(() => {
  sessionStorage.clear()
})

test('validateSeedForm rejects an empty seed and non-positive servings', () => {
  const base = {
    seed: '', allergens: [], skill: 'beginner', servings: '2',
    dietary: '', equipment: '', onHand: '',
  }
  expect(validateSeedForm(base)).toHaveLength(1)
  expect(validateSeedForm({ ...base, seed: 'stew', servings: '0' })).toHaveLength(1)
  expect(validateSeedForm({ ...base, seed: 'stew', servings: '2.5' })).toHaveLength(1)
  expect(validateSeedForm({ ...base, seed: 'stew', servings: '4' })).toHaveLength(0)
})

test('submitting an empty form shows errors and does not call the API', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  render(<SeedSetup onCreated={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /start dish/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/seed is required/i)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('renders all nine FDA Big-9 allergens as a multiselect', () => {
  render(<SeedSetup onCreated={() => {}} />)
  for (const a of BIG9_ALLERGENS) {
    expect(screen.getByRole('checkbox', { name: a })).toBeInTheDocument()
  }
})

test('a valid form posts typed constraints and reports the created dish', async () => {
  const created = dishDetail({ id: 'd9' })
  const fetchMock = vi.fn(async () => jsonResponse(created, 201))
  vi.stubGlobal('fetch', fetchMock)
  const onCreated = vi.fn()
  render(<SeedSetup onCreated={onCreated} />)

  fireEvent.change(screen.getByLabelText(/seed/i), { target: { value: 'a cozy chicken dinner' } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'milk' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'peanuts' }))
  fireEvent.change(screen.getByLabelText(/skill/i), { target: { value: 'advanced' } })
  fireEvent.change(screen.getByLabelText(/servings/i), { target: { value: '4' } })
  fireEvent.change(screen.getByLabelText(/dietary/i), { target: { value: 'vegetarian, low sodium' } })
  fireEvent.change(screen.getByLabelText(/on hand/i), { target: { value: 'thyme' } })
  fireEvent.click(screen.getByRole('button', { name: /start dish/i }))

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
