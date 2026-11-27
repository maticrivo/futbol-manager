import { expect, it } from 'vitest'
import {
  canStartPull,
  isDownwardPull,
  PULL_MAX,
  PULL_THRESHOLD,
  pullDistance,
  shouldRefresh,
} from '@/lib/pull-to-refresh'

const atTop = { touchCount: 1, scrollY: 0, mobile: true, refreshing: false }

it('starts only for one touch at the top of a mobile screen', () => {
  expect(canStartPull(atTop)).toBe(true)
  expect(canStartPull({ ...atTop, touchCount: 2 })).toBe(false)
  expect(canStartPull({ ...atTop, scrollY: 1 })).toBe(false)
  expect(canStartPull({ ...atTop, mobile: false })).toBe(false)
  expect(canStartPull({ ...atTop, refreshing: true })).toBe(false)
})

it('only treats a downward, mostly vertical drag as a pull', () => {
  expect(isDownwardPull({ deltaX: 0, deltaY: 20 })).toBe(true)
  expect(isDownwardPull({ deltaX: 4, deltaY: 20 })).toBe(true)
  expect(isDownwardPull({ deltaX: 30, deltaY: 5 })).toBe(false)
  expect(isDownwardPull({ deltaX: 0, deltaY: -20 })).toBe(false)
  expect(isDownwardPull({ deltaX: 0, deltaY: 0 })).toBe(false)
})

it('applies resistance and caps the pull distance', () => {
  expect(pullDistance(-10)).toBe(0)
  expect(pullDistance(0)).toBe(0)
  expect(pullDistance(20)).toBe(10)
  expect(pullDistance(400)).toBe(PULL_MAX)
})

it('arms the refresh at the threshold', () => {
  expect(shouldRefresh(PULL_THRESHOLD - 1)).toBe(false)
  expect(shouldRefresh(PULL_THRESHOLD)).toBe(true)
  expect(shouldRefresh(PULL_MAX)).toBe(true)
})
