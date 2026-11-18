import { DateTime } from 'luxon'

export const TZ = 'Asia/Jerusalem'

export function weekSchedule(matchDate: string, kickoffTime: string): {
  kickoffAt: Date
  signupOpensAt: Date
  guestPhaseAt: Date
  lockAt: Date
} {
  const matchDateTime = DateTime.fromISO(matchDate, { zone: TZ }).startOf('day')
  const [hours, minutes] = kickoffTime.split(':').map(Number)

  const kickoffAt = matchDateTime.set({ hour: hours, minute: minutes }).toJSDate()
  const lockAt = matchDateTime.set({ hour: 14, minute: 0 }).toJSDate()
  // guestPhaseAt: 1 day earlier at 14:00
  const guestPhaseAt = matchDateTime.minus({ days: 1 }).set({ hour: 14, minute: 0 }).toJSDate()
  // signupOpensAt: 4 days earlier (which is Friday 00:00 if match is Tuesday) at 00:00
  const signupOpensAt = matchDateTime.minus({ days: 4 }).set({ hour: 0, minute: 0 }).toJSDate()

  return {
    kickoffAt,
    signupOpensAt,
    guestPhaseAt,
    lockAt,
  }
}

export function billingMonthOf(date: Date): string {
  return DateTime.fromJSDate(date, { zone: TZ }).toFormat('yyyy-MM')
}

export function formatMatchDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(date)
}

export function formatMoney(agorot: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'ILS',
  }).format(agorot / 100)
}
