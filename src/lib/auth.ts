import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { auth } from '@/auth'
import { getDb } from '@/db'
import { users } from '@/db/schema'
import { toMember, type Member } from '@/domain/members'

// Share the session lookup between the navigation and page within one render.
export const getCurrentMember = cache(async (): Promise<Member | null> => {
  const session = await auth()
  const id = session?.user?.id
  if (!id) return null

  const [row] = await getDb().select().from(users).where(eq(users.id, id)).limit(1)
  if (!row || row.status === 'disabled') return null
  return toMember(row)
})

export async function requireMember(): Promise<Member> {
  const member = await getCurrentMember()
  if (!member) redirect('/login/expired')
  if (member.status === 'pending') redirect('/profile')
  return member
}

export async function requireSessionMember(): Promise<Member> {
  const member = await getCurrentMember()
  if (!member) redirect('/login/expired')
  return member
}

export async function requireAdmin(): Promise<Member> {
  const member = await requireMember()
  if (member.role !== 'admin') redirect('/')
  return member
}
