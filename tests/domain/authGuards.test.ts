import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { users } from '@/db/schema'
import { createMember } from '@/domain/members'
import { getCurrentMember, requireMember, requireSessionMember } from '@/lib/auth'
import { testDb, resetDb } from '../db'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => testDb,
}))

import { auth } from '@/auth'

beforeEach(async () => {
  await resetDb()
  vi.clearAllMocks()
})

describe('Auth.js guards', () => {
  it('returns a normalized member for an active Auth.js session', async () => {
    const member = (await createMember(testDb, { name: 'Active', email: 'active@example.com' })).member
    vi.mocked(auth).mockResolvedValue({ user: { id: member.id } } as never)

    const current = await getCurrentMember()
    expect(current?.id).toBe(member.id)
    expect(current?.name).toBe('Active')
  })

  it('redirects a pending member to /profile', async () => {
    const pending = (await createMember(testDb, { name: 'P', email: 'p@example.com', status: 'pending' })).member
    vi.mocked(auth).mockResolvedValue({ user: { id: pending.id } } as never)

    await expect(requireMember()).rejects.toThrow('NEXT_REDIRECT:/profile')
  })

  it('treats a disabled member with a valid session as signed out', async () => {
    const member = (await createMember(testDb, { name: 'Disabled', email: 'disabled@example.com' })).member
    await testDb.update(users).set({ status: 'disabled' }).where(eq(users.id, member.id))
    vi.mocked(auth).mockResolvedValue({ user: { id: member.id } } as never)

    expect(await getCurrentMember()).toBeNull()
    await expect(requireSessionMember()).rejects.toThrow('NEXT_REDIRECT:/login/expired')
  })

  it('treats a missing session as signed out', async () => {
    vi.mocked(auth).mockResolvedValue(null)

    expect(await getCurrentMember()).toBeNull()
    await expect(requireMember()).rejects.toThrow('NEXT_REDIRECT:/login/expired')
  })
})
