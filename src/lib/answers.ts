import type { MatchView } from '@/domain/matchView'

/** Actions in the member's answer area (desktop actions and the mobile action bar), primary first. */
export type AnswerAction = 'signup' | 'decline' | 'withdraw' | 'undecided'

/** The member's own answer, shown as a chip on the match card. */
export type ResponseChip = 'unanswered' | 'going' | 'queued' | 'notGoing'

type AnswerView = Pick<MatchView, 'phase' | 'spotsLeft' | 'myResponse' | 'myEntry' | 'myQueueEntry' | 'myOffer'>

function takesAnswers(phase: MatchView['phase']): boolean {
  return phase === 'open' || phase === 'guest'
}

export function answerActions(view: AnswerView): AnswerAction[] {
  // A member an admin added before signups opened can still step back.
  if (view.phase === 'before') return view.myEntry ? ['withdraw'] : []
  if (!takesAnswers(view.phase)) return []
  // Queued members and offers answer from the waiting-list card.
  if (view.myQueueEntry || view.myOffer) return []
  if (view.myEntry) return ['decline', 'withdraw']
  const signup: AnswerAction[] = view.spotsLeft > 0 ? ['signup'] : []
  return view.myResponse === 'not_going' ? [...signup, 'undecided'] : [...signup, 'decline']
}

export function responseChip(view: AnswerView): ResponseChip | null {
  if (!takesAnswers(view.phase)) return null
  if (view.myQueueEntry || view.myOffer) return 'queued'
  if (view.myEntry) return 'going'
  return view.myResponse === 'not_going' ? 'notGoing' : 'unanswered'
}
