import type { MatchPhase } from '@/domain/matchView'

export function matchPhaseTone(phase: MatchPhase): 'success' | 'neutral' | 'danger' | 'warning' | 'primary' {
  switch (phase) {
    case 'open':
    case 'guest':
      return 'success'
    case 'locked':
    case 'played':
      return 'neutral'
    case 'cancelled':
      return 'danger'
    case 'before':
    default:
      return 'warning'
  }
}

export default function MatchHero() {
  return null
}
