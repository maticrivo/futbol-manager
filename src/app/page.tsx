import { getTranslations } from 'next-intl/server'
import Countdown from '@/components/Countdown'
import GuestForm from '@/components/GuestForm'
import MatchActionForm from '@/components/MatchActionForm'
import MatchCard from '@/components/MatchCard'
import QueuePanel from '@/components/QueuePanel'
import RosterList from '@/components/RosterList'
import { getDb } from '@/db'
import { advanceMatch } from '@/domain/lock'
import { getMatchView } from '@/domain/matchView'
import { getUpcomingMatch } from '@/domain/matches'
import { requireMember } from '@/lib/auth'

export default async function Home() {
  const member = await requireMember()
  const db = getDb()
  const now = new Date()
  const upcoming = await getUpcomingMatch(db, now)
  const t = await getTranslations('match')
  if (!upcoming) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 text-start">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-2">{t('empty')}</p>
      </main>
    )
  }
  await advanceMatch(db, upcoming.id, now)
  const view = await getMatchView(db, { matchId: upcoming.id, memberId: member.id, now })
  const { match, phase, spotsLeft, roster, queue, queuePosition, myEntry, myQueueEntry, myOffer } = view
  const canSignup = (phase === 'open' || phase === 'guest') && spotsLeft > 0 && !myEntry && !myQueueEntry && !myOffer
  const canWithdraw = myEntry && (phase === 'before' || phase === 'open' || phase === 'guest')

  return (
    <main key={match.id} className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 text-start">
      <MatchCard match={match} phase={phase} spotsLeft={spotsLeft} />
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
      {canSignup && <MatchActionForm key="signup" intent="signup" matchId={match.id} />}
      {canWithdraw && <MatchActionForm key="withdraw" intent="withdraw" matchId={match.id} entryId={myEntry.id} />}
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
      {phase === 'guest' && <GuestForm matchId={match.id} />}
    </main>
  )
}
