export type Transition = { at: number; label: string }

export type CountdownUnit = 'day' | 'hour' | 'minute' | 'second'
export type CountdownPart = { unit: CountdownUnit; value: number }

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR
const SHOW_SECONDS_BELOW = 3 * SECONDS_PER_MINUTE

/**
 * Breaks the remaining time into at most two friendly parts, e.g. "2 days and
 * 16 hours" or "2 hours and 17 minutes". Seconds are only included when less
 * than three minutes remain.
 */
export function countdownParts(msRemaining: number): CountdownPart[] {
  const total = Math.max(0, Math.ceil(msRemaining / 1000))
  const days = Math.floor(total / SECONDS_PER_DAY)
  const hours = Math.floor(total / SECONDS_PER_HOUR) % 24
  const minutes = Math.floor(total / SECONDS_PER_MINUTE) % 60
  const seconds = total % SECONDS_PER_MINUTE

  if (days > 0) {
    return hours > 0
      ? [{ unit: 'day', value: days }, { unit: 'hour', value: hours }]
      : [{ unit: 'day', value: days }]
  }
  if (hours > 0) {
    return minutes > 0
      ? [{ unit: 'hour', value: hours }, { unit: 'minute', value: minutes }]
      : [{ unit: 'hour', value: hours }]
  }
  if (total >= SHOW_SECONDS_BELOW) return [{ unit: 'minute', value: minutes }]
  return minutes > 0
    ? [{ unit: 'minute', value: minutes }, { unit: 'second', value: seconds }]
    : [{ unit: 'second', value: seconds }]
}

export function nextTransition(transitions: Transition[], now: number): Transition | null {
  let next: Transition | null = null
  for (const transition of transitions) {
    if (transition.at > now && (next === null || transition.at < next.at)) next = transition
  }
  return next
}

export function latestPassedBoundary(transitions: Transition[], now: number): number | null {
  let latest: number | null = null
  for (const { at } of transitions) {
    if (at <= now && (latest === null || at > latest)) latest = at
  }
  return latest
}

export const DEFAULT_REFRESH_RETRY_MS = 2000

export function shouldRequestRefresh({
  confirmed, passed, now, lastRequestAt, retryMs = DEFAULT_REFRESH_RETRY_MS,
}: {
  confirmed: number | null
  passed: number | null
  now: number
  lastRequestAt: number | null
  retryMs?: number
}): boolean {
  if (passed === null || (confirmed !== null && passed <= confirmed)) return false
  return lastRequestAt === null || now - lastRequestAt >= retryMs
}
