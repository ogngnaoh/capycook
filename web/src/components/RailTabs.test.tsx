import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import RailTabs, { type RailTab } from './RailTabs'

// A controlled harness so the arrow keys have real selection to rove over.
function Harness({ initial = 'recipe' }: { initial?: RailTab }) {
  const [active, setActive] = useState<RailTab>(initial)
  return <RailTabs active={active} onChange={setActive} />
}

test('renders an APG tablist of the three workbench views', () => {
  render(<RailTabs active="recipe" onChange={() => {}} />)
  const list = screen.getByRole('tablist', { name: /view/i })
  expect(list).toBeInTheDocument()
  const tabs = screen.getAllByRole('tab')
  expect(tabs.map((t) => t.textContent)).toEqual(['Recipe', 'Develop', 'History'])
})

test('the tab bar only shows below the md breakpoint (md:hidden), collapsed additively', () => {
  render(<RailTabs active="recipe" onChange={() => {}} />)
  expect(screen.getByRole('tablist')).toHaveClass('md:hidden')
})

test('the active tab is the one selected control and the only tab stop (roving tabindex)', () => {
  render(<RailTabs active="develop" onChange={() => {}} />)
  const [recipe, develop, history] = screen.getAllByRole('tab')
  expect(develop).toHaveAttribute('aria-selected', 'true')
  expect(recipe).toHaveAttribute('aria-selected', 'false')
  expect(history).toHaveAttribute('aria-selected', 'false')
  // Only the selected tab is tabbable; the rest are reached by arrow keys.
  expect(develop).toHaveAttribute('tabindex', '0')
  expect(recipe).toHaveAttribute('tabindex', '-1')
  expect(history).toHaveAttribute('tabindex', '-1')
})

test('each tab controls its region via aria-controls', () => {
  render(<RailTabs active="recipe" onChange={() => {}} />)
  const [recipe, develop, history] = screen.getAllByRole('tab')
  expect(recipe).toHaveAttribute('aria-controls', 'canvas-region')
  expect(develop).toHaveAttribute('aria-controls', 'steering-anchor')
  expect(history).toHaveAttribute('aria-controls', 'trial-strip-region')
})

test('every tab clears the 24px target floor', () => {
  render(<RailTabs active="recipe" onChange={() => {}} />)
  for (const tab of screen.getAllByRole('tab')) {
    expect(tab).toHaveClass('min-h-[24px]')
  }
})

test('clicking a tab reports it', () => {
  const onChange = vi.fn()
  render(<RailTabs active="recipe" onChange={onChange} />)
  fireEvent.click(screen.getByRole('tab', { name: 'History' }))
  expect(onChange).toHaveBeenCalledWith('history')
})

test('Left/Right arrows rove and wrap, selecting as they move', () => {
  render(<Harness />)
  const tablist = screen.getByRole('tablist')
  const tab = (name: string) => screen.getByRole('tab', { name })
  expect(tab('Recipe')).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(tablist, { key: 'ArrowRight' })
  expect(tab('Develop')).toHaveAttribute('aria-selected', 'true')
  expect(tab('Develop')).toHaveFocus()
  fireEvent.keyDown(tablist, { key: 'ArrowRight' })
  expect(tab('History')).toHaveAttribute('aria-selected', 'true')
  // Right from the last wraps to the first.
  fireEvent.keyDown(tablist, { key: 'ArrowRight' })
  expect(tab('Recipe')).toHaveAttribute('aria-selected', 'true')
  // Left from the first wraps to the last.
  fireEvent.keyDown(tablist, { key: 'ArrowLeft' })
  expect(tab('History')).toHaveAttribute('aria-selected', 'true')
})

test('Home and End jump to the first and last tabs', () => {
  render(<Harness initial="develop" />)
  const tablist = screen.getByRole('tablist')
  fireEvent.keyDown(tablist, { key: 'End' })
  expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(tablist, { key: 'Home' })
  expect(screen.getByRole('tab', { name: 'Recipe' })).toHaveAttribute('aria-selected', 'true')
})
