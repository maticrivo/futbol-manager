'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { signIn, signOut } from '@/auth'
import { getDb } from '@/db'
import { users } from '@/db/schema'
import { isLocale, LOCALE_COOKIE } from '@/i18n/locale'
import { getCurrentMember } from '@/lib/auth'

export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = formData.get('locale')
  if (!isLocale(locale)) return

  const member = await getCurrentMember()
  if (member) {
    await getDb().update(users).set({ locale }).where(eq(users.id, member.id))
  }
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 365 * 24 * 3600 })
  revalidatePath('/')
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' })
}

export async function signInWithProviderAction(formData: FormData): Promise<void> {
  const provider = formData.get('provider')
  if (provider !== 'google' && provider !== 'facebook') return

  const redirectTo = formData.get('redirectTo') === '/profile' ? '/profile' : '/'
  await signIn(provider, { redirectTo })
}
