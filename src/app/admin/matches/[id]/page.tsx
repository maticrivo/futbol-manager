import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { headers } from 'next/headers'
import { and, eq, inArray } from 'drizzle-orm'
import { DateTime } from 'luxon'
import AdminNav from '@/components/AdminNav'
import AdminRoster from '@/components/AdminRoster'
import AttendanceList from '@/components/AttendanceList'
import CancelMatchForm from '@/components/CancelMatchForm'
import CopyMessage from '@/components/CopyMessage'
import EditMatchForm from '@/components/EditMatchForm'
import GuestPayments from '@/components/GuestPayments'
import { getDb } from '@/db'
import { entries } from '@/db/schema'
import { listGuestPayments, type MatchGuestPayment } from '@/domain/billing'
import { listMatchCharges } from '@/domain/charges'
import { advanceMatch } from '@/domain/lock'
import { listMembers } from '@/domain/members'
import { getMatch } from '@/domain/matches'
import { getMatchView } from '@/domain/matchView'
import { requireAdmin } from '@/lib/auth'
import { buildGroupMessage } from '@/lib/copy'
import { requestOrigin } from '@/lib/request-origin'
import { formatMatchDate, formatMoney, TZ } from '@/lib/time'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

function localDateTime(date: Date): string {
  return DateTime.fromJSDate(date, { zone: TZ }).toFormat("yyyy-MM-dd'T'HH:mm")
}

export default async function AdminMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  const { id } = await params
  const matchId = /^[0-9]+$/.test(id) ? Number(id) : NaN
  if (!Number.isSafeInteger(matchId) || matchId <= 0) notFound()

  const db = getDb()
  const match = await getMatch(db, matchId)
  if (!match) notFound()

  const now = new Date()
  await advanceMatch(db, match.id, now)

  const [view, members, charges, guestPayments, locale, t, tm] = await Promise.all([
    getMatchView(db, { matchId: match.id, memberId: admin.id, now }),
    listMembers(db),
    listMatchCharges(db, match.id),
    listGuestPayments(db, match.id),
    getLocale(),
    getTranslations('admin'),
    getTranslations('match'),
  ])

  const { match: current, phase, spotsLeft, roster } = view
  const finished = current.status === 'played' || current.status === 'cancelled'
  const locked = current.status === 'locked' || now >= current.lockAt
  const canOpenSignups = !locked && !finished && (phase === 'before' || now < current.signupOpensAt)

  const origin = requestOrigin(await headers(), process.env.APP_URL ?? 'http://localhost:3000')
  const signupCopy = buildGroupMessage('signup_open', locale, {
    date: formatMatchDate(current.kickoffAt, locale),
    venue: current.venue,
    url: `${origin}/`,
  })

  // Active members not already confirmed, queued or offered on this match.
  const occupied = await db.select({ memberId: entries.memberId }).from(entries)
    .where(and(eq(entries.matchId, current.id), inArray(entries.status, ['confirmed', 'queued', 'offered'])))
  const occupiedIds = new Set(occupied.flatMap(row => (row.memberId === null ? [] : [row.memberId])))
  const addableMembers = members
    .filter(member => member.status === 'active' && !occupiedIds.has(member.id))
    .map(member => ({ id: member.id, name: member.name }))

  const chargeByMember = new Map(charges.map(charge => [charge.memberId, charge]))
  const rosterRows = roster.map(entry => {
    const charge = entry.memberId !== null ? chargeByMember.get(entry.memberId) : undefined
    return {
      entryId: entry.id,
      name: entry.kind === 'guest' ? (entry.guestName ?? '') : (entry.memberName ?? ''),
      hostName: entry.kind === 'guest' ? entry.hostName : null,
      kind: entry.kind,
      charge: charge ? {
        id: charge.id,
        amount: formatMoney(charge.amountAgorot, locale),
        status: charge.status,
      } : null,
    }
  })

  const attendees = roster.map(entry => ({
    entryId: entry.id,
    name: entry.kind === 'guest' ? (entry.guestName ?? '') : (entry.memberName ?? ''),
    attended: entry.attended,
  }))

  const paymentsByEntry = new Map<number, MatchGuestPayment[]>()
  for (const payment of guestPayments) {
    const list = paymentsByEntry.get(payment.entryId) ?? []
    list.push(payment)
    paymentsByEntry.set(payment.entryId, list)
  }
  const refundedIds = new Set(
    guestPayments.filter(p => p.kind === 'refund' && p.refundOfId !== null).map(p => p.refundOfId),
  )
  const guestRows = roster
    .filter(entry => entry.kind === 'guest')
    .map(entry => ({
      entryId: entry.id,
      name: entry.guestName ?? '',
      hostName: entry.hostName,
      payments: (paymentsByEntry.get(entry.id) ?? []).map(p => ({
        id: p.id,
        kind: p.kind,
        amount: formatMoney(p.amountAgorot, locale),
        note: p.note,
        refunded: p.kind === 'payment' && refundedIds.has(p.id),
      })),
    }))

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 text-start">
      <AdminNav />

      <Card variant="default" padding="lg" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">{t('match.title')}</h1>
          <Badge variant="outline">{tm(`phase.${phase}`)}</Badge>
        </div>
        <div className="space-y-1 text-sm text-muted">
          <p className="text-lg font-semibold text-ink">
            <time dateTime={current.kickoffAt.toISOString()}>{formatMatchDate(current.kickoffAt, locale)}</time>
          </p>
          <p>{tm('spotsLeft', { count: spotsLeft })}</p>
          <p>{t('match.confirmed', { count: roster.length })}</p>
        </div>
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin">{t('match.back')}</Link>
          </Button>
        </div>
      </Card>

      <Card variant="default" padding="lg" className="space-y-4">
        <h2 className="text-xl font-semibold text-ink">{t('match.copy.title')}</h2>
        <pre dir="auto" className="whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-surface-muted border border-line p-4 text-sm text-ink font-mono">{signupCopy}</pre>
        <CopyMessage text={signupCopy} label={t('match.copy.button')} />
      </Card>

      <EditMatchForm
        matchId={current.id}
        venue={current.venue}
        venueUrl={current.venueUrl ?? ''}
        notes={current.notes ?? ''}
        capacity={current.capacity}
        costShekels={(current.costAgorot / 100).toFixed(2)}
        kickoffAt={localDateTime(current.kickoffAt)}
        signupOpensAt={localDateTime(current.signupOpensAt)}
        guestPhaseAt={localDateTime(current.guestPhaseAt)}
        lockAt={localDateTime(current.lockAt)}
        locked={locked}
        finished={finished}
        canOpenSignups={canOpenSignups}
      />

      <AdminRoster matchId={current.id} rows={rosterRows} members={addableMembers} locked={locked} disabled={finished} />

      <AttendanceList matchId={current.id} attendees={attendees} disabled={current.status === 'cancelled'} />

      <GuestPayments
        matchId={current.id}
        costShekels={(current.costAgorot / 100).toFixed(2)}
        guests={guestRows}
        disabled={current.status === 'cancelled'}
      />

      <CancelMatchForm matchId={current.id} state={current.status === 'cancelled' ? 'cancelled' : current.status === 'played' ? 'played' : 'open'} />
    </main>
  )
}
