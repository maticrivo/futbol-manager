import type { ReactNode } from 'react'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import CreateNextMatchForm from '@/components/CreateNextMatchForm'
import { getDb } from '@/db'
import { monthSummary } from '@/domain/billing'
import { listMembers } from '@/domain/members'
import { listUpcomingMatches } from '@/domain/matches'
import { phaseAt } from '@/domain/matchView'
import { requireAdmin } from '@/lib/auth'
import { billingMonthOf, formatMatchDate, formatMoney } from '@/lib/time'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Stat } from '@/components/ui/Stat'
import { Button } from '@/components/ui/Button'

export default async function AdminDashboard() {
  await requireAdmin()
  const db = getDb()
  const now = new Date()

  const [members, upcomingMatches, summary, locale, t, tm] = await Promise.all([
    listMembers(db),
    listUpcomingMatches(db, now),
    monthSummary(db, billingMonthOf(now)),
    getLocale(),
    getTranslations('admin'),
    getTranslations('match'),
  ])

  const activeCount = members.filter((m) => m.status === 'active').length
  const bidi = (chunks: ReactNode) => <bdi>{chunks}</bdi>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">{t('dashboard.title')}</h1>
        <CreateNextMatchForm />
      </div>

      <Card variant="default" padding="lg" className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">{t('dashboard.upcomingMatches')}</h2>
        {upcomingMatches.length > 0 ? (
          <ul className="space-y-3">
            {upcomingMatches.map((match) => {
              const phase = phaseAt(match, now)
              return (
                <li
                  key={match.id}
                  className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-ink">
                      <time dateTime={match.kickoffAt.toISOString()}>{formatMatchDate(match.kickoffAt, locale)}</time>
                    </p>
                    <p className="text-sm font-medium text-muted">
                      <bdi>{match.venue || tm('venueTbd')}</bdi>
                    </p>
                    <Badge variant={phase === 'cancelled' ? 'danger' : 'primary'}>
                      {tm(`phase.${phase}`)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/matches/${match.id}`}>{t('dashboard.manageMatch')}</Link>
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-muted">{t('dashboard.noMatch')}</p>
        )}
      </Card>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Stat
          label={t('dashboard.totalMembers')}
          value={members.length}
          icon="users"
        />
        <Stat
          label={t('dashboard.activeMembers')}
          value={activeCount}
          icon="check"
        />
        <Stat
          label={t('dashboard.outstandingBalance')}
          value={bidi(formatMoney(summary.outstandingAgorot, locale))}
          icon="alert"
        />
        <Stat
          label={t('dashboard.pot')}
          value={bidi(formatMoney(summary.differenceAgorot, locale))}
          icon="wallet"
        />
      </section>
    </div>
  )
}
