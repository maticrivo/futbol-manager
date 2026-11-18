export type Transition = { at: number; label: string }

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
