import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { getDb, type Db } from '@/db'
import { sessions } from '@/db/schema'
import type { Member } from '@/domain/members'
import { getSessionMember } from '@/domain/sessions'
import { hashToken } from '@/lib/tokens'

export const SESSION_COOKIE = 'fm_session'
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 365 * 24 * 3600,
} as const

// Share the session lookup between the navigation and page within one render.
export const getCurrentMember = cache(async (): Promise<Member | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return getSessionMember(getDb(), token, new Date())
})

export async function requireMember(): Promise<Member> {
  const member = await getCurrentMember()
  if (!member) redirect('/login/expired')
  return member
}

export async function requireAdmin(): Promise<Member> {
  const member = await requireMember()
  if (member.role !== 'admin') redirect('/')
  return member
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS)
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE)
}

export async function deleteSessionByToken(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
}
