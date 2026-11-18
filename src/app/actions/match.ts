'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb, type Db } from '@/db'
import { entries } from '@/db/schema'
import { addGuest, removeGuest, signup, withdraw } from '@/domain/entries'
import { advanceMatch } from '@/domain/lock'
import { claimOffer, joinQueue, leaveQueue } from '@/domain/queue'
import { toActionResult, type ActionResult } from '@/lib/actions'
import { requireMember } from '@/lib/auth'
import type { Result } from '@/lib/result'

type MatchInput = { db: Db; member: Awaited<ReturnType<typeof requireMember>>; matchId: number; now: Date }
type Mutation = (input: MatchInput) => Promise<Result<unknown>>
type EntryMutation = (input: MatchInput & { entryId: number }) => Promise<Result<unknown>>

function positiveId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

async function run(
  formData: FormData,
  mutate: Mutation,
): Promise<ActionResult> {
  const member = await requireMember()
  const matchId = positiveId(formData.get('matchId'))
  if (matchId === null) return { ok: false, code: 'NOT_FOUND' }

  const db = getDb()
  const now = new Date()
  const result = toActionResult(await mutate({ db, member, matchId, now }))
  if (result.ok) revalidatePath('/')
  return result
}

function matchMutation(mutate: Mutation): Mutation {
  return async input => {
    await advanceMatch(input.db, input.matchId, input.now)
    return mutate(input)
  }
}

function entryMutation(formData: FormData, mutate: EntryMutation): Mutation {
  return async input => {
    const { db, matchId, now } = input
    const entryId = positiveId(formData.get('entryId'))
    if (entryId === null) return { ok: false, code: 'NOT_FOUND' }
    // Entry services derive their match from the entry ID. Verify the posted pair
    // so we advance the same match the service is about to mutate.
    const [entry] = await db.select({ id: entries.id }).from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.matchId, matchId)))
    if (!entry) return { ok: false, code: 'NOT_FOUND' }
    await advanceMatch(db, matchId, now)
    return mutate({ ...input, entryId })
  }
}

export async function signupAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, matchMutation(({ db, member, matchId, now }) => signup(db, { memberId: member.id, matchId, now })))
}

export async function withdrawAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, entryMutation(formData, ({ db, member, entryId, now }) => withdraw(db, { actorMemberId: member.id, entryId, now })))
}

export async function joinQueueAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, matchMutation(({ db, member, matchId, now }) => joinQueue(db, { memberId: member.id, matchId, now })))
}

export async function leaveQueueAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, matchMutation(({ db, member, matchId, now }) => leaveQueue(db, { memberId: member.id, matchId, now })))
}

export async function claimOfferAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, entryMutation(formData, ({ db, member, entryId, now }) => claimOffer(db, { memberId: member.id, entryId, now })))
}

export async function addGuestAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, matchMutation(({ db, member, matchId, now }) => {
    const guestName = formData.get('guestName')
    return addGuest(db, { hostMemberId: member.id, matchId, now, name: typeof guestName === 'string' ? guestName : '' })
  }))
}

export async function removeGuestAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, entryMutation(formData, ({ db, member, entryId, now }) => removeGuest(db, {
    actorMemberId: member.id, entryId, now, asAdmin: member.role === 'admin',
  })))
}
