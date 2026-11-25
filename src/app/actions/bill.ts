'use server'

import { DrizzleQueryError } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/db'
import { NOTIFICATION_CATEGORIES, setNotificationPref } from '@/domain/notifications'
import type { ActionResult } from '@/lib/actions'
import { requireSessionMember } from '@/lib/auth'

export async function savePrefsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const member = await requireSessionMember()
  const db = getDb()

  try {
    await db.transaction(async tx => {
      for (const category of NOTIFICATION_CATEGORIES) {
        await setNotificationPref(tx, member.id, category, formData.get(category) !== null)
      }
    })
  } catch (error) {
    const cause = error instanceof DrizzleQueryError ? error.cause : error
    if (typeof cause !== 'object' || cause === null || !('code' in cause)) throw error
    console.error('savePrefsAction failed', cause)
    return { ok: false, code: 'UNKNOWN' }
  }

  revalidatePath('/bill')
  return { ok: true }
}
