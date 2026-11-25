import { beforeEach, expect, it } from 'vitest'
import { recordPayment } from '@/domain/billing'
import { signup } from '@/domain/entries'
import { createMember } from '@/domain/members'
import { resetDb, testDb } from '../db'
import { insertMatch } from '../helpers/fixtures'

const now = new Date('2027-03-27T10:00:00Z')

beforeEach(resetDb)

it('signs up and records a payment with Auth.js text member ids', async () => {
  const admin = (await createMember(testDb, { name: 'Admin', email: 'admin@example.com', role: 'admin' })).member
  const player = (await createMember(testDb, { name: 'Player', email: 'player@example.com' })).member
  const match = await insertMatch(testDb)

  const signupResult = await signup(testDb, { memberId: player.id, matchId: match.id, now })
  expect(signupResult.ok).toBe(true)

  const payment = await recordPayment(testDb, {
    actorId: admin.id,
    memberId: player.id,
    amountAgorot: 3500,
    paidAt: now,
    method: 'cash',
  })
  expect(payment.ok).toBe(true)
})
