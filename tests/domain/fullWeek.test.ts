import { and, desc, eq } from 'drizzle-orm'
import { beforeEach, expect, it } from 'vitest'
import { charges, entries } from '@/db/schema'
import {
  memberBalance,
  monthSummary,
  recordGuestPayment,
  recordPayment,
  setMonthlyExpense,
} from '@/domain/billing'
import { addGuest, signup, withdraw } from '@/domain/entries'
import { lockMatch } from '@/domain/lock'
import { createMatchForDate } from '@/domain/matches'
import { createMember } from '@/domain/members'
import { claimOffer, joinQueue } from '@/domain/queue'
import { resetDb, testDb } from '../db'

beforeEach(resetDb)

async function confirmedEntryId(matchId: number, memberId: string): Promise<number> {
  const [entry] = await testDb
    .select({ id: entries.id })
    .from(entries)
    .where(
      and(
        eq(entries.matchId, matchId),
        eq(entries.memberId, memberId),
        eq(entries.status, 'confirmed'),
      ),
    )
  if (!entry) throw new Error(`confirmed entry not found for member ${memberId}`)
  return entry.id
}

async function latestOffer(matchId: number) {
  const [entry] = await testDb
    .select()
    .from(entries)
    .where(and(eq(entries.matchId, matchId), eq(entries.status, 'offered')))
    .orderBy(desc(entries.updatedAt), desc(entries.id))
    .limit(1)
  if (!entry) throw new Error('no offer found')
  return entry
}

it('runs one full week and settles the month', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const people = []
  for (let i = 0; i < 19; i++) people.push((await createMember(testDb, { name: `P${i}` })).member)

  const saturday = new Date('2027-03-27T10:00:00Z')
  for (const p of people.slice(0, 13)) await signup(testDb, { memberId: p.id, matchId: match.id, now: saturday })
  const monday = new Date('2027-03-29T11:00:00Z')
  const guest = await addGuest(testDb, { hostMemberId: people[2].id, matchId: match.id, name: 'Dani', now: monday })
  expect(guest.ok).toBe(true)
  if (!guest.ok) throw new Error('guest not created')
  for (const p of people.slice(13, 15)) await joinQueue(testDb, { memberId: p.id, matchId: match.id, now: monday })

  const leaving = await withdraw(testDb, { entryId: await confirmedEntryId(match.id, people[0].id), actorMemberId: people[0].id, now: monday })
  expect(leaving.ok).toBe(true)
  const offer = await latestOffer(match.id)
  expect((await claimOffer(testDb, { entryId: offer.id, memberId: people[13].id, now: monday })).ok).toBe(true)

  const tuesdayLock = new Date('2027-03-30T11:00:00Z')
  await lockMatch(testDb, match.id, tuesdayLock)
  await recordGuestPayment(testDb, { actorId: admin.id, entryId: guest.value.id, amountAgorot: 3500, paidAt: tuesdayLock })
  await recordPayment(testDb, { actorId: admin.id, memberId: people[1].id, amountAgorot: 3500, paidAt: tuesdayLock, method: 'paybox' })
  await setMonthlyExpense(testDb, { actorId: admin.id, month: '2027-03', fieldCostAgorot: 20000 })

  const summary = await monthSummary(testDb, '2027-03')
  expect(summary.chargesAgorot).toBe(13 * 3500)
  expect(summary.memberCollectedAgorot).toBe(3500)
  expect(summary.guestCollectedAgorot).toBe(3500)
  expect(summary.expenseAgorot).toBe(20000)
  expect(summary.differenceAgorot).toBe(3500 + 3500 - 20000)
  expect(summary.outstandingAgorot).toBe(12 * 3500)
  expect((await memberBalance(testDb, people[1].id)).balanceAgorot).toBe(0)

  // Withdrawn member has no charge
  const withdrawnCharges = await testDb
    .select()
    .from(charges)
    .where(and(eq(charges.matchId, match.id), eq(charges.memberId, people[0].id)))
  expect(withdrawnCharges.length).toBe(0)

  // Guest is on the roster at lock
  const [guestEntry] = await testDb
    .select()
    .from(entries)
    .where(eq(entries.id, guest.value.id))
  expect(guestEntry).toBeDefined()
  expect(guestEntry.status).toBe('confirmed')
})
