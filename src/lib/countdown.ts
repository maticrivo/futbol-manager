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
