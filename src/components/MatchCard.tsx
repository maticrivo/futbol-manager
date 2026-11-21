import { getLocale, getTranslations } from 'next-intl/server'
import type { MatchView } from '@/domain/matchView'
import { formatMatchDate, formatMoney } from '@/lib/time'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/icons'
import { matchPhaseTone } from './MatchHero'

export default async function MatchCard({ match, phase, spotsLeft }: Pick<MatchView, 'match' | 'phase' | 'spotsLeft'>) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('match')])
  const tone = matchPhaseTone(phase)

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">{t('title')}</h1>
        <Badge variant={tone} size="md">
          {t(`phase.${phase}`)}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <div className="flex items-center gap-3 text-ink">
          <span className="p-2 bg-surface-muted rounded-[var(--radius-md)] text-primary">
            <Icon name="calendar" size={20} />
          </span>
          <div>
            <p className="text-xs text-muted font-medium">{t('kickoff') || 'Kickoff'}</p>
            <p className="text-sm font-semibold">
              <time dateTime={match.kickoffAt.toISOString()}>{formatMatchDate(match.kickoffAt, locale)}</time>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-ink">
          <span className="p-2 bg-surface-muted rounded-[var(--radius-md)] text-primary">
            <Icon name="map-pin" size={20} />
          </span>
          <div>
            <p className="text-xs text-muted font-medium">{t('venue') || 'Venue'}</p>
            <p className="text-sm font-semibold">
              <bdi>{match.venue || t('venueTbd')}</bdi>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-line">
        <div>
          <p className="text-xs text-muted font-medium">{t('costLabel') || 'Cost'}</p>
          <p className="text-base font-bold text-ink">
            {t.rich('cost', { amount: formatMoney(match.costAgorot, locale), bidi: chunks => <bdi>{chunks}</bdi> })}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted font-medium">{t('spotsLabel') || 'Availability'}</p>
          <p className="text-base font-bold text-primary">
            {t('spotsLeft', { count: spotsLeft })}
          </p>
        </div>
      </div>
    </Card>
  )
}
