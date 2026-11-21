'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '@/db'
import { members } from '@/db/schema'
import { isLocale, LOCALE_COOKIE } from '@/i18n/locale'
import { clearSessionCookie, deleteSessionByToken, getCurrentMember, SESSION_COOKIE } from '@/lib/auth'
import { requestMemberAccess } from '@/domain/members'
import { toActionResult, type ActionResult } from '@/lib/actions'

export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = formData.get('locale')
  if (!isLocale(locale)) return

  const member = await getCurrentMember()
  if (member) {
    await getDb().update(members).set({ locale }).where(eq(members.id, member.id))
  }
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 365 * 24 * 3600 })
  revalidatePath('/')
}

export async function logoutAction(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (token) await deleteSessionByToken(getDb(), token)
  await clearSessionCookie()
  redirect('/login/expired')
}

export async function requestMagicLinkAction(
  prevStateOrFormData: ActionResult | null | FormData,
  maybeFormData?: FormData
): Promise<ActionResult> {
  const formData =
    maybeFormData instanceof FormData
      ? maybeFormData
      : prevStateOrFormData instanceof FormData
        ? prevStateOrFormData
        : new FormData()
  const rawEmail = formData.get('email')
  if (typeof rawEmail !== 'string') {
    return { ok: false, code: 'INVALID_EMAIL' }
  }

  const rawName = formData.get('name')
  const rawNickname = formData.get('nickname')
  const rawPhone = formData.get('phone')
  const rawImage = formData.get('image')

  const profile = {
    ...(typeof rawName === 'string' ? { name: rawName } : {}),
    ...(typeof rawNickname === 'string' ? { nickname: rawNickname } : {}),
    ...(typeof rawPhone === 'string' ? { phone: rawPhone } : {}),
    ...(typeof rawImage === 'string' ? { image: rawImage } : {}),
  }

  const result = await requestMemberAccess(getDb(), rawEmail, new Date(), profile)
  return toActionResult(result)
}
