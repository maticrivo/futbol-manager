import {
  canStartPull,
  isDownwardPull,
  isPullIgnoredTarget,
  PULL_THRESHOLD,
  pullDistance,
  shouldRefresh,
} from '@/lib/pull-to-refresh'

type TouchLike = { clientX: number; clientY: number }

export type PullTouchEvent = {
  touches: ArrayLike<TouchLike>
  target?: Element | null
  cancelable?: boolean
  preventDefault?: () => void
}

export type PullWindow = {
  scrollY: number
  addEventListener: (
    type: string,
    listener: (event: PullTouchEvent) => void,
    options?: { passive?: boolean },
  ) => void
  removeEventListener: (type: string, listener: (event: PullTouchEvent) => void) => void
  matchMedia: (query: string) => {
    matches: boolean
    addEventListener: (type: 'change', listener: () => void) => void
    removeEventListener: (type: 'change', listener: () => void) => void
  }
}

export function attachPullToRefresh(
  win: PullWindow,
  callbacks: {
    isRefreshing: () => boolean
    onDistance: (distance: number) => void
    onRefresh: () => void
  },
): () => void {
  const media = win.matchMedia('(max-width: 767px)')
  let start: { x: number; y: number } | null = null
  let distance = 0

  const setDistance = (value: number) => {
    if (value === distance) return
    distance = value
    callbacks.onDistance(value)
  }

  const reset = () => {
    start = null
    setDistance(0)
  }

  const onTouchStart = (event: PullTouchEvent) => {
    if (event.touches.length !== 1) {
      if (start) reset()
      return
    }
    if (isPullIgnoredTarget(event.target ?? null)) return
    if (
      !canStartPull({
        touchCount: event.touches.length,
        scrollY: win.scrollY,
        mobile: media.matches,
        refreshing: callbacks.isRefreshing(),
      })
    ) {
      return
    }
    const touch = event.touches[0]
    start = { x: touch.clientX, y: touch.clientY }
  }

  const onTouchMove = (event: PullTouchEvent) => {
    if (!start) return
    if (event.touches.length !== 1) {
      reset()
      return
    }
    if (win.scrollY > 0) {
      reset()
      return
    }
    const touch = event.touches[0]
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (!isDownwardPull({ deltaX, deltaY })) {
      setDistance(0)
      return
    }
    if (event.cancelable) event.preventDefault?.()
    setDistance(pullDistance(deltaY))
  }

  const onTouchEnd = () => {
    if (!start) return
    start = null
    if (!shouldRefresh(distance)) {
      setDistance(0)
      return
    }
    setDistance(PULL_THRESHOLD)
    callbacks.onRefresh()
    setDistance(0)
  }

  const onTouchCancel = () => reset()
  const onOrientationChange = () => reset()
  const onMediaChange = () => {
    if (!media.matches) reset()
  }

  win.addEventListener('touchstart', onTouchStart, { passive: true })
  win.addEventListener('touchmove', onTouchMove, { passive: false })
  win.addEventListener('touchend', onTouchEnd)
  win.addEventListener('touchcancel', onTouchCancel)
  win.addEventListener('orientationchange', onOrientationChange)
  media.addEventListener('change', onMediaChange)

  return () => {
    win.removeEventListener('touchstart', onTouchStart)
    win.removeEventListener('touchmove', onTouchMove)
    win.removeEventListener('touchend', onTouchEnd)
    win.removeEventListener('touchcancel', onTouchCancel)
    win.removeEventListener('orientationchange', onOrientationChange)
    media.removeEventListener('change', onMediaChange)
  }
}
