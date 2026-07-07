import { render, screen } from '@testing-library/react'
import { DiffMark } from './DiffMark'

test('a replace speaks was/now and strikes the old value visually', () => {
  render(<DiffMark kind="replace" from="2 sprig" to="3 sprig" label="Ingredients — changed" />)
  const line = screen.getByRole('group', { name: 'Ingredients — changed' })
  const del = line.querySelector('del')!
  const ins = line.querySelector('ins')!
  expect(del).toHaveTextContent('was: 2 sprig')
  expect(ins).toHaveTextContent('now: 3 sprig')
  expect(del.className).toMatch(/line-through/)
  expect(del.className).toMatch(/text-muted/)
  expect(ins.className).toMatch(/bg-success-surface/)
  // The screen-reader prefixes are aural only.
  expect(del.querySelector('.sr-only')).toHaveTextContent('was:')
  expect(ins.querySelector('.sr-only')).toHaveTextContent('now:')
})

test('an add renders only the insertion, prefixed added', () => {
  render(<DiffMark kind="add" to="1 lemon" label="Ingredients — added" />)
  const line = screen.getByRole('group', { name: 'Ingredients — added' })
  expect(line.querySelector('del')).toBeNull()
  expect(line.querySelector('ins')).toHaveTextContent('added: 1 lemon')
})

test('a remove renders only the deletion, prefixed removed', () => {
  render(<DiffMark kind="remove" from="Sear skin-side down." label="Method — removed" />)
  const line = screen.getByRole('group', { name: 'Method — removed' })
  expect(line.querySelector('ins')).toBeNull()
  expect(line.querySelector('del')).toHaveTextContent('removed: Sear skin-side down.')
})

test('old reads before new, arrow is decoration only', () => {
  render(<DiffMark kind="replace" from="a" to="b" label="Title — changed" />)
  const line = screen.getByRole('group', { name: 'Title — changed' })
  expect(line.textContent).toMatch(/was: a.*now: b/)
  const arrow = line.querySelector('[aria-hidden="true"]')
  expect(arrow).not.toBeNull()
})
