import type { Match } from './matches'

export type MatchPhase = 'before' | 'open' | 'guest' | 'locked' | 'played' | 'cancelled'

export function phaseAt(match: Match, now: Date): MatchPhase {
  if (match.status === 'cancelled') return 'cancelled'
  if (match.status === 'played') return 'played'
  if (match.status === 'locked' || now >= match.lockAt) return 'locked'
  if (now >= match.guestPhaseAt) return 'guest'
  if (now >= match.signupOpensAt) return 'open'
  return 'before'
}
