'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/db'
import { updateMemberProfile, type MemberProfilePatch } from '@/domain/members'
import type { ActionResult } from '@/lib/actions'
import { requireMember } from '@/lib/auth'

export async function updateOwnProfileAction(
  prevStateOrFormData: ActionResult | null | FormData,
  maybeFormData?: FormData
): Promise<ActionResult> {
  const member = await requireMember()
  const db = getDb()

  const formData =
    maybeFormData instanceof FormData
      ? maybeFormData
      : prevStateOrFormData instanceof FormData
        ? prevStateOrFormData
        : new FormData()

  const patch: MemberProfilePatch = {}
  if (formData.has('name')) {
    const val = formData.get('name')
    if (typeof val === 'string') patch.name = val
  }
  if (formData.has('email')) {
    const val = formData.get('email')
    if (typeof val === 'string') patch.email = val
  }
  if (formData.has('phone')) {
    const val = formData.get('phone')
    if (typeof val === 'string') patch.phone = val
  }
  if (formData.has('nickname')) {
    const val = formData.get('nickname')
    if (typeof val === 'string') patch.nickname = val
  }
  if (formData.has('image')) {
    const val = formData.get('image')
    if (typeof val === 'string') patch.image = val
  }

  const result = await updateMemberProfile(db, {
    actorId: member.id,
    memberId: member.id,
    patch,
  })

  if (!result.ok) {
    return { ok: false, code: result.code }
  }

  revalidatePath('/profile')
  revalidatePath('/')
  return { ok: true }
}
