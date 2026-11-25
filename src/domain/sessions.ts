import type { Executor } from '@/db'
import { sessions } from '@/db/schema'
import { eq } from 'drizzle-orm'

export const SESSION_LIFETIME_DAYS = 365
export const SESSION_LIFETIME_MS = SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000

export async function revokeUserSessions(db: Executor, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}
