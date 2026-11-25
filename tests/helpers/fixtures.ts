import type { Db } from '@/db'
import { matches } from '@/db/schema'
import type { Match } from '@/domain/matches'

export async function insertMatch(db: Db): Promise<Match> {
  const [match] = await db
    .insert(matches)
    .values({
      matchDate: '2027-03-30',
      kickoffAt: new Date('2027-03-30T17:30:00Z'),
      signupOpensAt: new Date('2027-03-25T22:00:00Z'),
      guestPhaseAt: new Date('2027-03-29T11:00:00Z'),
      lockAt: new Date('2027-03-30T11:00:00Z'),
      venue: 'Campo',
      costAgorot: 3500,
      capacity: 14,
    })
    .returning()

  return match
}
