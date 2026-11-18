import { expect, it } from 'vitest'
import { latestPassedBoundary, nextTransition, shouldRequestRefresh } from '@/lib/countdown'

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

it('does not request a refresh before any boundary has passed', () => {
  expect(shouldRequestRefresh({ confirmed: null, passed: null, now: 99, lastRequestAt: null })).toBe(false)
})

it('requests a refresh when a boundary passes before the server confirms it', () => {
  expect(shouldRequestRefresh({ confirmed: null, passed: 100, now: 100, lastRequestAt: null })).toBe(true)
})

it('retries the same unconfirmed boundary once two seconds have elapsed', () => {
  const state = { confirmed: null, passed: 0, lastRequestAt: 0 }
  expect(shouldRequestRefresh({ ...state, now: 1999 })).toBe(false)
  expect(shouldRequestRefresh({ ...state, now: 2000 })).toBe(true)
})

it('stops retrying once the server confirms the boundary', () => {
  expect(shouldRequestRefresh({ confirmed: 100, passed: 100, now: 5100, lastRequestAt: 100 })).toBe(false)
})

it('requests a refresh for a later boundary after the throttle window', () => {
  expect(shouldRequestRefresh({ confirmed: 100, passed: 200, now: 3100, lastRequestAt: 100 })).toBe(true)
})

it('respects a custom retry interval', () => {
  expect(shouldRequestRefresh({ confirmed: null, passed: 100, now: 600, lastRequestAt: 100, retryMs: 500 })).toBe(true)
})
