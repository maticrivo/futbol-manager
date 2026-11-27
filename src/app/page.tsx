import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import Countdown from '@/components/Countdown'
import GuestForm from '@/components/GuestForm'
import MatchCard from '@/components/MatchCard'
import BagDutyPanel from '@/components/BagDutyPanel'
import QueuePanel from '@/components/QueuePanel'
import RosterList from '@/components/RosterList'
import MobileActionBar from '@/components/MobileActionBar'
import AnswerActions from '@/components/AnswerActions'
import ResponsesPanel from '@/components/ResponsesPanel'
import { getDb } from '@/db'
import { advanceMatch } from '@/domain/lock'
import { getMatchView } from '@/domain/matchView'
import { getUpcomingMatch } from '@/domain/matches'
import { listMatchResponses } from '@/domain/responses'
import { answerActions, responseChip } from '@/lib/answers'
import { requireMember } from '@/lib/auth'
import { Card } from '@/components/ui/Card'

export default async function Home() {
  const member = await requireMember()
  if (member.status === 'pending') {
    redirect('/login/pending')
  }
  const db = getDb()
  const now = new Date()
  const upcoming = await getUpcomingMatch(db, now)
  const t = await getTranslations('match')
  if (!upcoming) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 text-start">
        <Card className="space-y-3 p-6 text-center">
          <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>
          <p className="text-sm text-muted">{t('empty')}</p>
        </Card>
      </main>
    )
  }
  await advanceMatch(db, upcoming.id, now)
  const [view, responses] = await Promise.all([
    getMatchView(db, { matchId: upcoming.id, memberId: member.id, now }),
    listMatchResponses(db, { matchId: upcoming.id, viewer: member, now }),
  ])
  const { match, phase, spotsLeft, roster, queue, queuePosition, myEntry, myQueueEntry, myOffer } = view
  const actions = answerActions(view)

  return (
    <main key={match.id} className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 pb-28 md:pb-8 text-start">
      <MatchCard match={match} phase={phase} spotsLeft={spotsLeft} response={responseChip(view)} />
      {view.bagDuty && <BagDutyPanel duty={view.bagDuty} />}
      {phase !== 'played' && phase !== 'cancelled' && (
        <Countdown
          renderedAt={now.toISOString()}
          signupAt={match.signupOpensAt.toISOString()}
          guestAt={match.guestPhaseAt.toISOString()}
          lockAt={match.lockAt.toISOString()}
          kickoffAt={match.kickoffAt.toISOString()}
          signupLabel={t('countdown.signup')}
          guestLabel={t('countdown.guest')}
          lockLabel={t('countdown.lock')}
          kickoffLabel={t('countdown.kickoff')}
        />
      )}
      {actions.some(intent => intent !== 'join') && (
        <div className="hidden md:flex flex-wrap items-start gap-3">
          {/* On desktop the waiting-list card beside it already holds Join. */}
          <AnswerActions actions={actions.filter(intent => intent !== 'join')} matchId={match.id} entryId={myEntry?.id} prefix="desktop" />
        </div>
      )}
      <RosterList roster={roster} matchId={match.id} myEntryId={myEntry?.id ?? null} memberId={member.id} asAdmin={member.role === 'admin'} phase={phase} />
      <QueuePanel
        match={match}
        phase={phase}
        spotsLeft={spotsLeft}
        queue={queue}
        queuePosition={queuePosition}
        myEntry={myEntry}
        myQueueEntry={myQueueEntry}
        myOffer={myOffer}
      />
      <ResponsesPanel {...responses} showEmpty={phase === 'open' || phase === 'guest'} />
      {phase === 'guest' && <GuestForm matchId={match.id} />}
      <MobileActionBar
        actions={actions}
        matchId={match.id}
        entryId={myEntry?.id}
        spotsLeft={spotsLeft}
      />
    </main>
  )
}
