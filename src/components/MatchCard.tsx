import { getLocale, getTranslations } from 'next-intl/server'
import type { MatchView } from '@/domain/matchView'
import { formatMatchDate, formatMoney } from '@/lib/time'

export default async function MatchCard({ match, phase, spotsLeft }: Pick<MatchView, 'match' | 'phase' | 'spotsLeft'>) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('match')])
  return (
    <section className="space-y-2 rounded-xl border p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <span className="rounded-full border px-3 py-1 text-sm font-medium">{t(`phase.${phase}`)}</span>
      </div>
      <p className="text-lg font-medium">
        <time dateTime={match.kickoffAt.toISOString()}>{formatMatchDate(match.kickoffAt, locale)}</time>
      </p>
      <p><bdi>{match.venue || t('venueTbd')}</bdi></p>
      <p>{t.rich('cost', { amount: formatMoney(match.costAgorot, locale), bidi: chunks => <bdi>{chunks}</bdi> })}</p>
      <p>{t('spotsLeft', { count: spotsLeft })}</p>
    </section>
  )
}
