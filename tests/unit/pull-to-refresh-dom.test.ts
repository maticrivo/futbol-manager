import { expect, it, vi } from 'vitest'
import { attachPullToRefresh, type PullTouchEvent, type PullWindow } from '@/lib/pull-to-refresh-dom'
import { PULL_THRESHOLD } from '@/lib/pull-to-refresh'

type Listener = (event: PullTouchEvent) => void

class FakeMedia {
  matches = true
  private listeners = new Set<() => void>()

  addEventListener(_type: 'change', listener: () => void) {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'change', listener: () => void) {
    this.listeners.delete(listener)
  }

  change(matches: boolean) {
    this.matches = matches
    for (const listener of this.listeners) listener()
  }

  get size() {
    return this.listeners.size
  }
}

class FakeWindow {
  scrollY = 0
  media = new FakeMedia()
  private listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set<Listener>()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener)
  }

  matchMedia() {
    return this.media
  }

  dispatch(type: string, event: PullTouchEvent) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  count(type: string) {
    return this.listeners.get(type)?.size ?? 0
  }
}

function touchEvent(
  y: number,
  x = 0,
  options: { target?: Element | null; touchCount?: number } = {},
): PullTouchEvent & { preventDefault: ReturnType<typeof vi.fn> } {
  const preventDefault = vi.fn()
  const touchCount = options.touchCount ?? 1
  return {
    touches: Array.from({ length: touchCount }, () => ({ clientX: x, clientY: y })),
    target: options.target ?? null,
    cancelable: true,
    preventDefault,
  }
}

function setup() {
  const win = new FakeWindow()
  const distances: number[] = []
  const refresh = vi.fn()
  let refreshing = false

  const detach = attachPullToRefresh(win as unknown as PullWindow, {
    isRefreshing: () => refreshing,
    onDistance: (distance) => distances.push(distance),
    onRefresh: refresh,
  })

  return {
    win,
    distances,
    refresh,
    detach,
    setRefreshing: (value: boolean) => {
      refreshing = value
    },
  }
}

it('refreshes after a downward pull past the threshold', () => {
  const { win, distances, refresh } = setup()

  win.dispatch('touchstart', touchEvent(100))
  const move = touchEvent(100 + PULL_THRESHOLD * 2)
  win.dispatch('touchmove', move)
  win.dispatch('touchend', touchEvent(100 + PULL_THRESHOLD * 2))

  expect(move.preventDefault).toHaveBeenCalled()
  expect(refresh).toHaveBeenCalledTimes(1)
  expect(distances).toContain(PULL_THRESHOLD)
})

it('does not swallow a tap with a small downward drift', () => {
  const { win, distances, refresh } = setup()

  win.dispatch('touchstart', touchEvent(100))
  const move = touchEvent(105)
  win.dispatch('touchmove', move)
  win.dispatch('touchend', touchEvent(105))

  expect(move.preventDefault).not.toHaveBeenCalled()
  expect(distances).toEqual([])
  expect(refresh).not.toHaveBeenCalled()
})

it('does not treat a horizontal drag as a pull', () => {
  const { win, distances, refresh } = setup()

  win.dispatch('touchstart', touchEvent(100, 100))
  const move = touchEvent(110, 140)
  win.dispatch('touchmove', move)
  win.dispatch('touchend', touchEvent(110, 140))

  expect(move.preventDefault).not.toHaveBeenCalled()
  expect(distances).toEqual([])
  expect(refresh).not.toHaveBeenCalled()
})

it('never arms from a two-finger start', () => {
  const { win, distances, refresh } = setup()

  win.dispatch('touchstart', touchEvent(100, 0, { touchCount: 2 }))
  win.dispatch('touchmove', touchEvent(300))
  win.dispatch('touchend', touchEvent(300))

  expect(distances).toEqual([])
  expect(refresh).not.toHaveBeenCalled()
})

it('does not start on an interactive control', () => {
  const { win, distances, refresh } = setup()
  const target = { closest: () => ({}) } as unknown as Element

  win.dispatch('touchstart', touchEvent(100, 0, { target }))
  win.dispatch('touchmove', touchEvent(300))
  win.dispatch('touchend', touchEvent(300))

  expect(distances).toEqual([])
  expect(refresh).not.toHaveBeenCalled()
})

it('does not start when the page is already scrolled', () => {
  const { win, distances, refresh } = setup()
  win.scrollY = 20

  win.dispatch('touchstart', touchEvent(100))
  win.dispatch('touchmove', touchEvent(300))
  win.dispatch('touchend', touchEvent(300))

  expect(distances).toEqual([])
  expect(refresh).not.toHaveBeenCalled()
})

it('clears a half-started pull when the viewport leaves mobile', () => {
  const { win, distances, refresh } = setup()

  win.dispatch('touchstart', touchEvent(100))
  win.dispatch('touchmove', touchEvent(180))
  expect(distances.at(-1)).toBeGreaterThan(0)

  win.media.change(false)
  expect(distances.at(-1)).toBe(0)

  win.dispatch('touchmove', touchEvent(300))
  win.dispatch('touchend', touchEvent(300))
  expect(refresh).not.toHaveBeenCalled()
})

it('cleans up every listener', () => {
  const { win, detach } = setup()

  detach()

  expect(win.count('touchstart')).toBe(0)
  expect(win.count('touchmove')).toBe(0)
  expect(win.count('touchend')).toBe(0)
  expect(win.count('touchcancel')).toBe(0)
  expect(win.count('orientationchange')).toBe(0)
  expect(win.media.size).toBe(0)
})
