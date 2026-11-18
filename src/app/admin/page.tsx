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
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 text-start">
      <AdminNav />
      <h1 className="text-2xl font-semibold">{t('dashboard.title')}</h1>
      <p className="text-sm">
        <Link href="/admin/money">{t('nav.money')}</Link>
      </p>

      <section className="space-y-3 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">{t('dashboard.upcomingMatch')}</h2>
        {upcoming ? (
          <div className="space-y-1">
            <p className="text-lg font-medium">
              <time dateTime={upcoming.kickoffAt.toISOString()}>{formatMatchDate(upcoming.kickoffAt, locale)}</time>
            </p>
            <p>
              <bdi>{upcoming.venue || tm('venueTbd')}</bdi>
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {tm(`phase.${phaseAt(upcoming, now)}`)}
            </p>
          </div>
        ) : (
          <p className="text-neutral-600 dark:text-neutral-300">{t('dashboard.noMatch')}</p>
        )}
        <CreateNextMatchForm />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.totalMembers')}</p>
          <p className="text-2xl font-semibold">{members.length}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.activeMembers')}</p>
          <p className="text-2xl font-semibold">{activeCount}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.outstandingBalance')}</p>
          <p className="text-2xl font-semibold">{bidi(formatMoney(summary.outstandingAgorot, locale))}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.pot')}</p>
          <p className="text-2xl font-semibold">{bidi(formatMoney(summary.differenceAgorot, locale))}</p>
        </div>
      </section>
    </main>
  )
}
