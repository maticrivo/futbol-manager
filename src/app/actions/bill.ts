'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/db'
import { NOTIFICATION_CATEGORIES, setNotificationPref } from '@/domain/notifications'
import type { ActionResult } from '@/lib/actions'
import { requireMember } from '@/lib/auth'

export async function savePrefsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const member = await requireMember()
  const db = getDb()

  for (const category of NOTIFICATION_CATEGORIES) {
    await setNotificationPref(db, member.id, category, formData.get(category) !== null)
  }

  revalidatePath('/bill')
  return { ok: true }
}
