import { expect, it } from 'vitest'
import { latestPassedBoundary, nextTransition } from '@/lib/countdown'

const transitions = [
  { at: 300, label: 'Lock' },
  { at: 100, label: 'Signup' },
  { at: 200, label: 'Guests' },
]

it('finds the earliest strictly future transition, even out of order', () => {
  expect(nextTransition(transitions, 100)).toEqual({ at: 200, label: 'Guests' })
})

it('returns no next transition after the last one', () => {
  expect(nextTransition(transitions, 301)).toBeNull()
})

it('finds the greatest boundary that has passed, even out of order', () => {
  expect(latestPassedBoundary(transitions, 250)).toBe(200)
})

it('returns no passed boundary before the first one', () => {
  expect(latestPassedBoundary(transitions, 99)).toBeNull()
})

it('counts a boundary equal to now as passed', () => {
  expect(latestPassedBoundary(transitions, 300)).toBe(300)
})
