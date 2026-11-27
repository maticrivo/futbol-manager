export const PULL_THRESHOLD = 64
export const PULL_MAX = 96
export const PULL_SLOP = 8

const RESISTANCE = 0.5
const PULL_IGNORE_SELECTOR =
  'a, button, [role="button"], input, select, textarea, [data-pull-ignore]'

export function canStartPull(input: {
  touchCount: number
  scrollY: number
  mobile: boolean
  refreshing: boolean
}): boolean {
  return input.touchCount === 1 && input.scrollY <= 0 && input.mobile && !input.refreshing
}

export function isPullIgnoredTarget(target: Element | null): boolean {
  return Boolean(target?.closest(PULL_IGNORE_SELECTOR))
}

export function isDownwardPull(input: { deltaX: number; deltaY: number }): boolean {
  return input.deltaY >= PULL_SLOP && input.deltaY > Math.abs(input.deltaX)
}

export function pullDistance(deltaY: number): number {
  return Math.min(Math.max(deltaY, 0) * RESISTANCE, PULL_MAX)
}

export function shouldRefresh(distance: number): boolean {
  return distance >= PULL_THRESHOLD
}
