import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import Countdown from '@/components/Countdown'
import GuestForm from '@/components/GuestForm'
import MatchActionForm from '@/components/MatchActionForm'
import MatchCard from '@/components/MatchCard'
import QueuePanel from '@/components/QueuePanel'
import RosterList from '@/components/RosterList'
import MobileActionBar from '@/components/MobileActionBar'
import { getDb } from '@/db'
import { advanceMatch } from '@/domain/lock'
import { getMatchView } from '@/domain/matchView'
import { getUpcomingMatch } from '@/domain/matches'
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
  const view = await getMatchView(db, { matchId: upcoming.id, memberId: member.id, now })
  const { match, phase, spotsLeft, roster, queue, queuePosition, myEntry, myQueueEntry, myOffer } = view
  const canSignup = (phase === 'open' || phase === 'guest') && spotsLeft > 0 && !myEntry && !myQueueEntry && !myOffer
  const canWithdraw = myEntry && (phase === 'before' || phase === 'open' || phase === 'guest')

  return (
    <main key={match.id} className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 pb-28 md:pb-8 text-start">
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
      <div className="hidden md:block space-y-3">
        {canSignup && <MatchActionForm key="signup" intent="signup" matchId={match.id} />}
        {canWithdraw && <MatchActionForm key="withdraw" intent="withdraw" matchId={match.id} entryId={myEntry.id} />}
      </div>
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
      <MobileActionBar
        canSignup={canSignup}
        canWithdraw={canWithdraw}
        matchId={match.id}
        entryId={myEntry?.id}
        spotsLeft={spotsLeft}
      />
    </main>
  )
}
