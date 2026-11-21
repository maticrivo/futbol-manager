import type { ReactNode } from 'react'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import AdminNav from '@/components/AdminNav'
import CreateNextMatchForm from '@/components/CreateNextMatchForm'
import { getDb } from '@/db'
import { monthSummary } from '@/domain/billing'
import { listMembers } from '@/domain/members'
import { getUpcomingMatch } from '@/domain/matches'
import { phaseAt } from '@/domain/matchView'
import { requireAdmin } from '@/lib/auth'
import { billingMonthOf, formatMatchDate, formatMoney } from '@/lib/time'
import { Card } from '@/components/ui/Card'
import { Stat } from '@/components/ui/Stat'
import { Button } from '@/components/ui/Button'

export default async function AdminDashboard() {
  await requireAdmin()
  const db = getDb()
  const now = new Date()

  const [members, upcoming, summary, locale, t, tm] = await Promise.all([
    listMembers(db),
    getUpcomingMatch(db, now),
    monthSummary(db, billingMonthOf(now)),
    getLocale(),
    getTranslations('admin'),
    getTranslations('match'),
  ])

  const activeCount = members.filter((m) => m.status === 'active').length
  const bidi = (chunks: ReactNode) => <bdi>{chunks}</bdi>

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 text-start">
      <AdminNav />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">{t('dashboard.title')}</h1>
        <Link href="/admin/money">
          <Button variant="outline" size="sm">
            {t('nav.money')}
          </Button>
        </Link>
      </div>

      <Card variant="default" padding="lg" className="space-y-4">
        <h2 className="text-lg font-semibold text-ink">{t('dashboard.upcomingMatch')}</h2>
        {upcoming ? (
          <div className="space-y-2">
            <p className="text-xl font-semibold text-ink">
              <time dateTime={upcoming.kickoffAt.toISOString()}>{formatMatchDate(upcoming.kickoffAt, locale)}</time>
            </p>
            <p className="text-muted font-medium">
              <bdi>{upcoming.venue || tm('venueTbd')}</bdi>
            </p>
            <div>
              <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
                {tm(`phase.${phaseAt(upcoming, now)}`)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-muted">{t('dashboard.noMatch')}</p>
        )}
        <div className="pt-2">
          <CreateNextMatchForm />
        </div>
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
    </main>
  )
}
