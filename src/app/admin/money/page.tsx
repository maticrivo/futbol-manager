import { getLocale, getTranslations } from 'next-intl/server'
import { headers } from 'next/headers'
import AdminNav from '@/components/AdminNav'
import BalanceTable from '@/components/BalanceTable'
import CopyMessage from '@/components/CopyMessage'
import MoneySummary from '@/components/MoneySummary'
import { getDb } from '@/db'
import { memberBalance, monthSummary } from '@/domain/billing'
import { listMembers } from '@/domain/members'
import { requireAdmin } from '@/lib/auth'
import { buildGroupMessage } from '@/lib/copy'
import { requestOrigin } from '@/lib/request-origin'
import { billingMonthOf, formatMoney } from '@/lib/time'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

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

  const origin = requestOrigin(await headers(), process.env.APP_URL ?? 'http://localhost:3000')
  const billCopy = buildGroupMessage('bill_ready', locale, { month, url: `${origin}/bill` })

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 text-start">
      <AdminNav />
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">{t('money.title')}</h1>

      <Card variant="default" padding="md">
        <form method="GET" className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <Field label={t('money.month')} className="flex-1">
            <input type="month" name="month" defaultValue={month} className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" />
          </Field>
          <Button type="submit" variant="outline" size="md">
            {t('money.show')}
          </Button>
        </form>
      </Card>

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

      <Card variant="default" padding="lg" className="space-y-4">
        <h2 className="text-xl font-semibold text-ink">{t('money.copy.title')}</h2>
        <pre dir="auto" className="whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-surface-muted border border-line p-4 text-sm text-ink font-mono">{billCopy}</pre>
        <CopyMessage text={billCopy} label={t('money.copy.button')} />
      </Card>
    </main>
  )
}
