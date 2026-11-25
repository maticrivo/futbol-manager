import { randomUUID } from 'node:crypto'
import type { Db } from '@/db'
import { sessions } from '@/db/schema'

export async function createTestSession(
  db: Db,
  userId: string,
  expires: Date = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
): Promise<string> {
  const sessionToken = `test-${randomUUID()}`
  await db.insert(sessions).values({ sessionToken, userId, expires })
  return sessionToken
}
