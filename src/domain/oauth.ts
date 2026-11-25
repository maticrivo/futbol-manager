import type { Db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { writeAudit } from './audit'
import { isValidEmail } from './members'

export const OAUTH_PROVIDERS = ['google', 'facebook'] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

export function normalizeOAuthIdentity(input: {
  name?: string | null
  email?: string | null
}): { name: string; email: string } | null {
  const email = input.email?.trim().toLowerCase()
  if (!email || !isValidEmail(email)) return null

  const name = input.name?.trim().slice(0, 120) || email.split('@')[0]
  return { name, email }
}

export function isConfiguredAdminEmail(email: string | null | undefined): boolean {
  const configured = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  return Boolean(configured && email && email.trim().toLowerCase() === configured)
}

export async function authorizeOAuthSignIn(
  db: Db,
  input: { id?: string; email: string }
): Promise<boolean | string> {
  const normalizedEmail = input.email.trim().toLowerCase()

  const [existing] = input.id
    ? await db.select().from(users).where(eq(users.id, input.id)).limit(1)
    : await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1)

  if (!existing) return true
  if (existing.status === 'disabled') return false

  if (
    isConfiguredAdminEmail(existing.email ?? normalizedEmail) &&
    (existing.role !== 'admin' || existing.status !== 'active')
  ) {
    await db
      .update(users)
      .set({ role: 'admin', status: 'active' })
      .where(eq(users.id, existing.id))
  }

  return true
}

export async function onCreateOAuthUser(
  db: Db,
  user: { id: string; email?: string | null }
): Promise<void> {
  if (!user.email) return

  const status = isConfiguredAdminEmail(user.email) ? 'active' : 'pending'
  if (isConfiguredAdminEmail(user.email)) {
    await db
      .update(users)
      .set({ role: 'admin', status: 'active' })
      .where(eq(users.id, user.id))
  }

  await writeAudit(db, {
    actorId: user.id,
    action: 'member.request_access',
    entity: 'member',
    entityId: user.id,
    detail: {
      email: user.email.trim().toLowerCase(),
      status,
    },
  })
}

export async function onOAuthSignIn(
  db: Db,
  input: { id?: string; provider?: string }
): Promise<void> {
  if (!input.id) return

  await writeAudit(db, {
    actorId: input.id,
    action: 'auth.login',
    entity: 'member',
    entityId: input.id,
    detail: input.provider ? { provider: input.provider } : undefined,
  })
}

export async function onLinkOAuthAccount(
  db: Db,
  input: { userId: string; provider: string }
): Promise<void> {
  await writeAudit(db, {
    actorId: input.userId,
    action: 'member.link_account',
    entity: 'member',
    entityId: input.userId,
    detail: { provider: input.provider },
  })
}
