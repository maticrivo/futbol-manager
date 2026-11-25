import { beforeEach, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { updateOwnProfileAction } from '@/app/actions/profile'
import { createMember, listMembers } from '@/domain/members'
import { requireSessionMember } from '@/lib/auth'
import { resetDb, testDb } from '../db'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireSessionMember: vi.fn() }))
vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => testDb,
}))

beforeEach(async () => {
  vi.clearAllMocks()
  await resetDb()
})

it('updateOwnProfileAction updates app-managed profile fields and revalidates', async () => {
  const member = (await createMember(testDb, { name: 'SelfUser', email: 'self@example.com' })).member
  vi.mocked(requireSessionMember).mockResolvedValue(member)

  const form = new FormData()
  form.set('name', 'SelfUser Renamed')
  form.set('nickname', 'Selfie')
  form.set('email', 'other@example.com')
  form.set('phone', '+1 555 123 4567')
  form.set('image', 'https://example.com/me.png')

  const res = await updateOwnProfileAction(null, form)
  expect(res).toEqual({ ok: true })
  expect(revalidatePath).toHaveBeenCalledWith('/profile')
  expect(revalidatePath).toHaveBeenCalledWith('/')

  const updated = (await listMembers(testDb)).find((m) => m.id === member.id)!
  expect(updated.name).toBe('SelfUser Renamed')
  expect(updated.nickname).toBe('Selfie')
  expect(updated.email).toBe('self@example.com')
  expect(updated.phone).toBe('+1 555 123 4567')
  expect(updated.image).toBe('https://example.com/me.png')
})

it('updateOwnProfileAction returns an error if name validation fails', async () => {
  const member = (await createMember(testDb, { name: 'SelfUser', email: 'self@example.com' })).member
  vi.mocked(requireSessionMember).mockResolvedValue(member)

  const form = new FormData()
  form.set('name', '   ')

  const res = await updateOwnProfileAction(null, form)
  expect(res).toEqual({ ok: false, code: 'INVALID_NAME' })
})
