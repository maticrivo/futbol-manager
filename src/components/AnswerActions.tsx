import type { AnswerAction } from '@/lib/answers'
import MatchActionForm from './MatchActionForm'

export default function AnswerActions({
  actions, matchId, entryId, prefix,
}: {
  actions: AnswerAction[]
  matchId: number
  entryId?: number | null
  prefix: string
}) {
  return actions.map(intent => intent === 'withdraw'
    ? entryId != null && <MatchActionForm key={`${prefix}-${intent}`} intent="withdraw" matchId={matchId} entryId={entryId} />
    : <MatchActionForm key={`${prefix}-${intent}`} intent={intent} matchId={matchId} />)
}
