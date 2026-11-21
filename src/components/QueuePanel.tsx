import { getLocale, getTranslations } from 'next-intl/server'
import type { MatchView } from '@/domain/matchView'
import { formatMatchDate } from '@/lib/time'
import MatchActionForm from './MatchActionForm'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/icons'
import { InlineMessage } from '@/components/ui/InlineMessage'

export default async function QueuePanel({
  match, phase, spotsLeft, queue, queuePosition, myEntry, myQueueEntry, myOffer,
}: Pick<MatchView, 'match' | 'phase' | 'spotsLeft' | 'queue' | 'queuePosition' | 'myEntry' | 'myQueueEntry' | 'myOffer'>) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('queue')])
  const queueOpen = phase === 'open' || phase === 'guest'
  const canJoin = queueOpen && spotsLeft === 0 && !myEntry && !myOffer && !myQueueEntry
  const canLeave = queueOpen && myQueueEntry !== null
  const expiration = myOffer?.offerExpiresAt

  if (!queueOpen && queue.length === 0 && !myOffer && queuePosition === null) {
    return null
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
          <Icon name="clock" size={18} className="text-warning" />
          {t('title')}
        </h2>
        {queuePosition !== null && (
          <Badge variant="warning" size="sm">
            {t('position', { position: queuePosition })}
          </Badge>
        )}
      </div>

      {myOffer && queueOpen && (
        <InlineMessage variant="warning" title={t('offered')} icon={<Icon name="alert-triangle" size={18} />}>
          <div className="space-y-3 mt-1">
            {expiration && (
              <p className="text-xs">
                {t.rich('expires', {
                  expiration: formatMatchDate(expiration, locale),
                  bidi: chunks => <bdi><time dateTime={expiration.toISOString()}>{chunks}</time></bdi>,
                })}
              </p>
            )}
            <MatchActionForm key={myOffer.id} intent="claim" matchId={match.id} entryId={myOffer.id} />
          </div>
        </InlineMessage>
      )}

      {queue.length === 0 ? (
        <p className="text-sm text-muted py-2">{t('empty')}</p>
      ) : (
        <ol className="space-y-2">
          {queue.map((entry, index) => (
            <li key={entry.id} className="flex items-center justify-between text-sm py-1.5 px-3 bg-surface-muted rounded-[var(--radius-sm)]">
              <span className="flex items-center gap-2 font-medium text-ink">
                <span className="text-xs text-muted font-mono">{index + 1}.</span>
                <bdi>{entry.memberName}</bdi>
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="pt-2 flex flex-wrap gap-2">
        {canJoin && <MatchActionForm key="join" intent="join" matchId={match.id} />}
        {canLeave && <MatchActionForm key="leave" intent="leave" matchId={match.id} />}
      </div>
    </Card>
  )
}
