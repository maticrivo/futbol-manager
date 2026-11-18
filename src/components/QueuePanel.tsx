import { getLocale, getTranslations } from 'next-intl/server'
import type { MatchView } from '@/domain/matchView'
import { formatMatchDate } from '@/lib/time'
import MatchActionForm from './MatchActionForm'

export default async function QueuePanel({
  match, phase, spotsLeft, queue, queuePosition, myEntry, myQueueEntry, myOffer,
}: MatchView) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('queue')])
  const canQueue = (phase === 'open' || phase === 'guest') && spotsLeft === 0 && !myEntry && !myOffer
  const expiration = myOffer?.offerExpiresAt
  return (
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      {myOffer && (
        <div className="space-y-2 rounded-md border-2 border-emerald-600 p-3">
          <p className="font-semibold">{t('offered')}</p>
          {expiration && <p>{t.rich('expires', {
            expiration: formatMatchDate(expiration, locale),
            bidi: chunks => <bdi><time dateTime={expiration.toISOString()}>{chunks}</time></bdi>,
          })}</p>}
          <MatchActionForm key={myOffer.id} intent="claim" matchId={match.id} entryId={myOffer.id} />
        </div>
      )}
      {queuePosition !== null && <p>{t('position', { position: queuePosition })}</p>}
      {queue.length === 0 ? <p>{t('empty')}</p> : (
        <ol className="list-decimal ps-6">
          {queue.map(entry => <li key={entry.id}><bdi>{entry.memberName}</bdi></li>)}
        </ol>
      )}
      {canQueue && <MatchActionForm key={myQueueEntry ? 'leave' : 'join'} intent={myQueueEntry ? 'leave' : 'join'} matchId={match.id} />}
    </section>
  )
}
