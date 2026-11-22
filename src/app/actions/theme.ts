'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { isTheme, THEME_COOKIE } from '@/lib/theme'

export async function setThemeAction(formData: FormData): Promise<void> {
  const theme = formData.get('theme')
  if (!isTheme(theme)) return

  ;(await cookies()).set(THEME_COOKIE, theme, {
    path: '/',
    maxAge: 365 * 24 * 3600,
    sameSite: 'lax',
  })
  revalidatePath('/', 'layout')
}
