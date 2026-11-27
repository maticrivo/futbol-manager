'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb, type Db } from '@/db'
import { entries } from '@/db/schema'
import { addGuest, clearDecline, decline, removeGuest, signup, withdraw } from '@/domain/entries'
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
  action: { match: Mutation } | { entry: EntryMutation },
): Promise<ActionResult> {
  const member = await requireMember()
  const matchId = positiveId(formData.get('matchId'))
  if (matchId === null) return { ok: false, code: 'NOT_FOUND' }

  const db = getDb()
  let mutate: Mutation
  if ('entry' in action) {
    const entryId = positiveId(formData.get('entryId'))
    if (entryId === null) return { ok: false, code: 'NOT_FOUND' }
    // Entry services derive their match from the entry ID. Verify the posted pair
    // so we advance the same match the service is about to mutate.
    const [entry] = await db.select({ id: entries.id }).from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.matchId, matchId)))
    if (!entry) return { ok: false, code: 'NOT_FOUND' }
    mutate = input => action.entry({ ...input, entryId })
  } else {
    mutate = action.match
  }

  const now = new Date()
  await advanceMatch(db, matchId, now)
  const result = toActionResult(await mutate({ db, member, matchId, now }))
  // Advancement can change the screen even when the requested mutation fails.
  revalidatePath('/')
  return result
}

export async function signupAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, { match: ({ db, member, matchId, now }) => signup(db, { memberId: member.id, matchId, now }) })
}

export async function withdrawAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, { entry: ({ db, member, entryId, now }) => withdraw(db, { actorMemberId: member.id, entryId, now }) })
}

export async function declineAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, { match: ({ db, member, matchId, now }) => decline(db, { memberId: member.id, matchId, now }) })
}

export async function clearDeclineAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, { match: ({ db, member, matchId, now }) => clearDecline(db, { memberId: member.id, matchId, now }) })
}

export async function joinQueueAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, { match: ({ db, member, matchId, now }) => joinQueue(db, { memberId: member.id, matchId, now }) })
}

export async function leaveQueueAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, { match: ({ db, member, matchId, now }) => leaveQueue(db, { memberId: member.id, matchId, now }) })
}

export async function claimOfferAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, { entry: ({ db, member, entryId, now }) => claimOffer(db, { memberId: member.id, entryId, now }) })
}

export async function addGuestAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, {
    match: ({ db, member, matchId, now }) => {
      const guestName = formData.get('guestName')
      return addGuest(db, { hostMemberId: member.id, matchId, now, name: typeof guestName === 'string' ? guestName : '' })
    },
  })
}

export async function removeGuestAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return run(formData, {
    entry: ({ db, member, entryId, now }) => removeGuest(db, {
      actorMemberId: member.id, entryId, now, asAdmin: member.role === 'admin',
    }),
  })
}
