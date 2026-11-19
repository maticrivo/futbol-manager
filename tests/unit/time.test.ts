import { describe, expect, it } from 'vitest'
import { billingMonthOf, formatMoney, weekSchedule } from '@/lib/time'

describe('weekSchedule', () => {
  it('handles the spring DST change inside one week', () => {
    const s = weekSchedule('2027-03-30', '20:30')
    expect(s.signupOpensAt.toISOString()).toBe('2027-03-25T22:00:00.000Z') // Fri 00:00 +02
    expect(s.guestPhaseAt.toISOString()).toBe('2027-03-29T11:00:00.000Z') // Mon 14:00 +03
    expect(s.lockAt.toISOString()).toBe('2027-03-30T11:00:00.000Z') // Tue 14:00 +03
    expect(s.kickoffAt.toISOString()).toBe('2027-03-30T17:30:00.000Z')
  })

  it('handles the autumn DST change inside one week', () => {
    const s = weekSchedule('2027-11-02', '20:30')
    expect(s.signupOpensAt.toISOString()).toBe('2027-10-28T21:00:00.000Z') // Fri 00:00 +03
    expect(s.guestPhaseAt.toISOString()).toBe('2027-11-01T12:00:00.000Z') // Mon 14:00 +02
    expect(s.lockAt.toISOString()).toBe('2027-11-02T12:00:00.000Z') // Tue 14:00 +02
  })

  it('defaults to 20:00 kickoff when kickoffTime is omitted', () => {
    const s = weekSchedule('2027-03-30')
    expect(s.kickoffAt.toISOString()).toBe('2027-03-30T17:00:00.000Z')
  })
})

it('derives the billing month in Jerusalem time', () => {
  expect(billingMonthOf(new Date('2027-11-02T17:30:00Z'))).toBe('2027-11')
  expect(billingMonthOf(new Date('2027-11-01T00:30:00Z'))).toBe('2027-11')
})

it('formats money in shekels', () => {
  expect(formatMoney(3500, 'en')).toBe('₪35.00')
})
