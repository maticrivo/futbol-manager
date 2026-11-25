import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMember } from '@/domain/members'
import { resetDb, testDb } from '../db'
import { createTestSession } from '../helpers/session'

const state = vi.hoisted(() => ({ token: undefined as string | undefined }))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((name: string) =>
      (name === 'authjs.session-token' || name === '__Secure-authjs.session-token') && state.token
        ? { name, value: state.token }
        : undefined
    ),
  })),
  headers: vi.fn(async () => new Headers({
    host: 'localhost:3000',
    'x-forwarded-proto': 'http',
    cookie: state.token
      ? `authjs.session-token=${state.token}; __Secure-authjs.session-token=${state.token}`
      : '',
  })),
}))

vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => testDb,
}))

import { auth } from '@/auth'

beforeEach(async () => {
  await resetDb()
  state.token = undefined
})

describe('real Auth.js session wiring', () => {
  it('returns the database session user id from auth()', async () => {
    const member = (await createMember(testDb, { name: 'Session User', email: 'session@example.com' })).member
    state.token = await createTestSession(testDb, member.id)

    const session = await auth()

    expect(session?.user?.id).toBe(member.id)
    expect(session?.user?.email).toBe('session@example.com')
  })

  it('returns null without a session cookie', async () => {
    expect(await auth()).toBeNull()
  })
})
