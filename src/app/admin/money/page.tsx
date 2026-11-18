import { getLocale, getTranslations } from 'next-intl/server'
import AdminNav from '@/components/AdminNav'
import BalanceTable from '@/components/BalanceTable'
import MoneySummary from '@/components/MoneySummary'
import { getDb } from '@/db'
import { memberBalance, monthSummary } from '@/domain/billing'
import { listMembers } from '@/domain/members'
import { requireAdmin } from '@/lib/auth'
import { billingMonthOf, formatMoney } from '@/lib/time'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] | undefined }>
}) {
  await requireAdmin()
  const db = getDb()
  const now = new Date()

  const params = await searchParams
  const monthParam = typeof params.month === 'string' ? params.month : undefined
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : billingMonthOf(now)

  const members = await listMembers(db)
  const active = members.filter(m => m.status === 'active')

  const [summary, locale, t, balances] = await Promise.all([
    monthSummary(db, month),
    getLocale(),
    getTranslations('admin'),
    Promise.all(active.map(m => memberBalance(db, m.id))),
  ])

  const rows = active.map((member, index) => {
    const balanceAgorot = balances[index].balanceAgorot
    return {
      id: member.id,
      name: member.name,
      balanceAgorot,
      balanceLabel: formatMoney(Math.abs(balanceAgorot), locale),
      credit: balanceAgorot < 0,
    }
  })

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 text-start">
      <AdminNav />
      <h1 className="text-2xl font-semibold">{t('money.title')}</h1>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block text-sm font-medium">{t('money.month')}</span>
          <input type="month" name="month" defaultValue={month} className="mt-1 rounded border px-3 py-2" />
        </label>
        <button type="submit" className="cursor-pointer rounded-md border px-4 py-2 font-medium">
          {t('money.show')}
        </button>
      </form>

      <MoneySummary
        month={month}
        chargesAgorot={summary.chargesAgorot}
        memberCollectedAgorot={summary.memberCollectedAgorot}
        guestCollectedAgorot={summary.guestCollectedAgorot}
        expenseAgorot={summary.expenseAgorot}
        differenceAgorot={summary.differenceAgorot}
        outstandingAgorot={summary.outstandingAgorot}
        locale={locale}
      />

      <BalanceTable rows={rows} />
    </main>
  )
}
