import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import {
  addMemberAction,
  createNextMatchAction,
  linkMemberAction,
  setMemberRoleAction,
  setMemberStatusAction,
  updateMemberAction,
  updateSettingsAction,
} from '@/app/actions/admin'
import { auditLog, matches } from '@/db/schema'
import { createMember, listMembers, setMemberRole } from '@/domain/members'
import { createMatchForDate, getSettings } from '@/domain/matches'
import { requireAdmin } from '@/lib/auth'
import { resetDb, testDb } from '../db'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/db', async importOriginal => ({
  ...await importOriginal<typeof import('@/db')>(),
  getDb: () => testDb,
}))

const originalAdminEmail = process.env.ADMIN_EMAIL

beforeEach(async () => {
  vi.clearAllMocks()
  delete process.env.ADMIN_EMAIL
  await resetDb()
})

afterEach(() => {
  if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL
  else process.env.ADMIN_EMAIL = originalAdminEmail
})

function idForm(memberId: string) {
  const data = new FormData()
  data.set('memberId', memberId)
  return data
}

function statusForm(memberId: string, status: string) {
  const data = idForm(memberId)
  data.set('status', status)
  return data
}

function roleForm(memberId: string, role: string) {
  const data = idForm(memberId)
  data.set('role', role)
  return data
}

function addForm(email: string, role?: string, locale?: string, status?: string) {
  const data = new FormData()
  data.set('email', email)
  if (role) data.set('role', role)
  if (locale) data.set('locale', locale)
  if (status) data.set('status', status)
  return data
}

function settingsForm(overrides: Record<string, string> = {}) {
  const data = new FormData()
  data.set('capacity', '14')
  data.set('costShekels', '35')
  data.set('venue', '')
  data.set('kickoffTime', '20:30')
  data.set('queueWindowMinutes', '30')
  for (const [key, value] of Object.entries(overrides)) data.set(key, value)
  return data
}

async function matchDates() {
  const rows = await testDb.select().from(matches).orderBy(matches.matchDate)
  return rows.map((row) => row.matchDate)
}

it('rejects when the admin authorization check fails, without creating rows', async () => {
  const redirectError = new Error('NEXT_REDIRECT')
  const membersBefore = (await listMembers(testDb)).length
  const matchesBefore = (await matchDates()).length

  vi.mocked(requireAdmin).mockRejectedValueOnce(redirectError)
  await expect(addMemberAction(null, addForm('ghost@example.com'))).rejects.toThrow('NEXT_REDIRECT')
  expect(await listMembers(testDb)).toHaveLength(membersBefore)

  vi.mocked(requireAdmin).mockRejectedValueOnce(redirectError)
  await expect(createNextMatchAction(null, new FormData())).rejects.toThrow('NEXT_REDIRECT')
  expect(await matchDates()).toHaveLength(matchesBefore)
})

it('addMemberAction creates an active member from an email', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const result = await addMemberAction(null, addForm('Ana@Example.com', 'member', 'es'))
  expect(result).toEqual({ ok: true })

  const created = (await listMembers(testDb)).find((m) => m.email === 'ana@example.com')
  expect(created).toBeDefined()
  expect(created?.name).toBe('ana')
  expect(created?.locale).toBe('es')
  expect(created?.status).toBe('active')

  expect(revalidatePath).toHaveBeenCalledWith('/admin/members')
  expect(revalidatePath).toHaveBeenCalledWith('/admin')
})

it('addMemberAction rejects invalid and duplicate emails and creates nothing', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await addMemberAction(null, addForm('   '))).toEqual({ ok: false, code: 'INVALID_EMAIL' })
  expect(await addMemberAction(null, addForm('not-an-email'))).toEqual({ ok: false, code: 'INVALID_EMAIL' })

  expect((await addMemberAction(null, addForm('Taken@Example.com'))).ok).toBe(true)
  expect(await addMemberAction(null, addForm(' taken@example.com '))).toEqual({ ok: false, code: 'EMAIL_TAKEN' })

  const takenRows = (await listMembers(testDb)).filter((m) => m.email === 'taken@example.com')
  expect(takenRows).toHaveLength(1)
})

it('setMemberStatusAction disables and re-enables, and forbids disabling self', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const other = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await setMemberStatusAction(null, statusForm(admin.id, 'disabled'))).toEqual({ ok: false, code: 'FORBIDDEN' })

  expect(await setMemberStatusAction(null, statusForm(other.id, 'disabled'))).toEqual({ ok: true })
  expect((await listMembers(testDb)).find((m) => m.id === other.id)!.status).toBe('disabled')

  expect(await setMemberStatusAction(null, statusForm(other.id, 'active'))).toEqual({ ok: true })
  expect((await listMembers(testDb)).find((m) => m.id === other.id)!.status).toBe('active')
})

it('setMemberStatusAction supports pending status and approving pending members', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const pendingMember = (await createMember(testDb, { name: 'Pending User', email: 'pending@example.com', status: 'pending' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await setMemberStatusAction(null, statusForm(admin.id, 'pending'))).toEqual({ ok: false, code: 'FORBIDDEN' })

  expect(await setMemberStatusAction(null, statusForm(pendingMember.id, 'active'))).toEqual({ ok: true })
  expect((await listMembers(testDb)).find((m) => m.id === pendingMember.id)!.status).toBe('active')

  expect(await setMemberStatusAction(null, statusForm(pendingMember.id, 'pending'))).toEqual({ ok: true })
  expect((await listMembers(testDb)).find((m) => m.id === pendingMember.id)!.status).toBe('pending')

  expect(await setMemberStatusAction(null, statusForm(pendingMember.id, 'invalid'))).toEqual({ ok: false, code: 'NOT_FOUND' })
})

it('addMemberAction supports adding a member by email with pending status', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const result = await addMemberAction(null, addForm('newplayer@example.com', 'member', 'es', 'pending'))
  expect(result).toEqual({ ok: true })

  const created = (await listMembers(testDb)).find((m) => m.email === 'newplayer@example.com')
  expect(created).toBeDefined()
  expect(created?.name).toBe('newplayer')
  expect(created?.status).toBe('pending')
  expect(created?.role).toBe('member')
  expect(created?.locale).toBe('es')
})

it('updateSettingsAction converts shekels to agorot and rejects malformed values', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await updateSettingsAction(null, settingsForm({ costShekels: '35.5' }))).toEqual({ ok: true })
  expect((await getSettings(testDb)).costAgorot).toBe(3550)

  const before = await getSettings(testDb)
  expect(await updateSettingsAction(null, settingsForm({ costShekels: '35.555' }))).toEqual({ ok: false, code: 'INVALID_SETTING' })
  expect(await updateSettingsAction(null, settingsForm({ costShekels: 'abc' }))).toEqual({ ok: false, code: 'INVALID_SETTING' })
  expect(await getSettings(testDb)).toEqual(before)
})

it('updateSettingsAction persists venue, kickoff and capacity', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await updateSettingsAction(null, settingsForm({
    venue: 'Kraft Stadium', kickoffTime: '21:00', capacity: '16',
  }))).toEqual({ ok: true })

  const settings = await getSettings(testDb)
  expect(settings.venue).toBe('Kraft Stadium')
  expect(settings.kickoffTime).toBe('21:00')
  expect(settings.capacity).toBe(16)
})

it('createNextMatchAction keeps adding successive weeks from the furthest upcoming match', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  await createMatchForDate(testDb, '2027-03-30')

  expect(await createNextMatchAction(null, new FormData())).toEqual({ ok: true })
  expect(await matchDates()).toEqual(['2027-03-30', '2027-04-06'])

  expect(await createNextMatchAction(null, new FormData())).toEqual({ ok: true })
  expect(await matchDates()).toEqual(['2027-03-30', '2027-04-06', '2027-04-13'])
})

it('createNextMatchAction creates the next Tuesday when no match exists', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date('2027-03-24T12:00:00Z'))
    expect(await createNextMatchAction(null, new FormData())).toEqual({ ok: true })
  } finally {
    vi.useRealTimers()
  }

  expect(await matchDates()).toEqual(['2027-03-30'])
})

it('linkMemberAction links a pending duplicate to an active member', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const target = (await createMember(testDb, { name: 'Target', email: 'target@example.com' })).member
  const pending = (await createMember(testDb, { name: 'Duplicate', email: 'duplicate@example.com', status: 'pending' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const form = new FormData()
  form.set('pendingId', pending.id)
  form.set('targetId', target.id)

  expect(await linkMemberAction(null, form)).toEqual({ ok: true })
  expect((await listMembers(testDb)).find((member) => member.id === pending.id)).toBeUndefined()
  expect(revalidatePath).toHaveBeenCalledWith('/admin/members')
})

it('updateMemberAction updates profile fields and leaves email unchanged', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const target = (await createMember(testDb, { name: 'OldName', email: 'old@example.com' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const form = new FormData()
  form.set('memberId', target.id)
  form.set('name', 'NewName')
  form.set('nickname', 'Speedy')
  form.set('email', 'newname@example.com')
  form.set('phone', '+972 50 999 8888')
  form.set('image', 'https://example.com/avatar.jpg')

  const res = await updateMemberAction(null, form)
  expect(res).toEqual({ ok: true })
  expect(revalidatePath).toHaveBeenCalledWith('/admin/members')
  expect(revalidatePath).toHaveBeenCalledWith('/admin')
  expect(revalidatePath).toHaveBeenCalledWith('/')

  const updatedTarget = (await listMembers(testDb)).find((m) => m.id === target.id)!
  expect(updatedTarget.name).toBe('NewName')
  expect(updatedTarget.nickname).toBe('Speedy')
  expect(updatedTarget.email).toBe('old@example.com')
  expect(updatedTarget.phone).toBe('+972 50 999 8888')
  expect(updatedTarget.image).toBe('https://example.com/avatar.jpg')
})

it('setMemberRoleAction promotes an active member and audits the change', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const target = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await setMemberRoleAction(null, roleForm(target.id, 'admin'))).toEqual({ ok: true })
  expect((await listMembers(testDb)).find((m) => m.id === target.id)!.role).toBe('admin')

  const audits = await testDb
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, 'member.role'), eq(auditLog.entityId, target.id)))
  expect(audits).toHaveLength(1)
  expect(audits[0].actorId).toBe(admin.id)
  expect(audits[0].detail).toEqual({ role: 'admin' })
  expect(revalidatePath).toHaveBeenCalledWith('/admin/members')
})

it('setMemberRoleAction rejects promoting pending and disabled members', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const pending = (await createMember(testDb, { name: 'Pending', email: 'pending@example.com', status: 'pending' })).member
  const disabled = (await createMember(testDb, { name: 'Off', email: 'off@example.com', status: 'disabled' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await setMemberRoleAction(null, roleForm(pending.id, 'admin'))).toEqual({ ok: false, code: 'MEMBER_NOT_ACTIVE' })
  expect(await setMemberRoleAction(null, roleForm(disabled.id, 'admin'))).toEqual({ ok: false, code: 'MEMBER_NOT_ACTIVE' })
  expect((await listMembers(testDb)).find((m) => m.id === pending.id)!.role).toBe('member')
  expect((await listMembers(testDb)).find((m) => m.id === disabled.id)!.role).toBe('member')
})

it('setMemberRoleAction demotes another admin but not yourself', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const other = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await setMemberRoleAction(null, roleForm(other.id, 'member'))).toEqual({ ok: true })
  expect((await listMembers(testDb)).find((m) => m.id === other.id)!.role).toBe('member')

  expect(await setMemberRoleAction(null, roleForm(admin.id, 'member'))).toEqual({ ok: false, code: 'FORBIDDEN' })
  expect((await listMembers(testDb)).find((m) => m.id === admin.id)!.role).toBe('admin')

  // The just-demoted admin cannot demote anyone else.
  expect(await setMemberRole(testDb, other.id, admin.id, 'member')).toEqual({ ok: false, code: 'FORBIDDEN' })
})

it('setMemberRoleAction refuses to demote the configured superuser', async () => {
  process.env.ADMIN_EMAIL = ' BOSS@Example.com '
  const superuser = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const other = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(other)

  expect(await setMemberRoleAction(null, roleForm(superuser.id, 'member'))).toEqual({ ok: false, code: 'FORBIDDEN' })
  expect((await listMembers(testDb)).find((m) => m.id === superuser.id)!.role).toBe('admin')

  // Regular promotions still work while ADMIN_EMAIL is set.
  const player = (await createMember(testDb, { name: 'Player', email: 'player@example.com' })).member
  expect(await setMemberRoleAction(null, roleForm(player.id, 'admin'))).toEqual({ ok: true })
})

it('setMemberRoleAction rejects malformed role changes', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const target = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await setMemberRoleAction(null, roleForm(target.id, 'owner'))).toEqual({ ok: false, code: 'NOT_FOUND' })
  expect(await setMemberRoleAction(null, idForm(target.id))).toEqual({ ok: false, code: 'NOT_FOUND' })
  expect(await setMemberRoleAction(null, roleForm('not-a-uuid', 'admin'))).toEqual({ ok: false, code: 'NOT_FOUND' })
  expect(await setMemberRoleAction(null, roleForm(crypto.randomUUID(), 'admin'))).toEqual({ ok: false, code: 'NOT_FOUND' })

  expect((await listMembers(testDb)).find((m) => m.id === target.id)!.role).toBe('member')
  expect(await testDb.select().from(auditLog).where(eq(auditLog.action, 'member.role'))).toHaveLength(0)
})

it('setMemberRoleAction rejects when the admin authorization check fails', async () => {
  const target = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com' })).member
  vi.mocked(requireAdmin).mockRejectedValueOnce(new Error('NEXT_REDIRECT'))

  await expect(setMemberRoleAction(null, roleForm(target.id, 'admin'))).rejects.toThrow('NEXT_REDIRECT')
  expect((await listMembers(testDb)).find((m) => m.id === target.id)!.role).toBe('member')
})

it('setMemberRoleAction treats an unchanged role as a no-op with no audit entry', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const target = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await setMemberRoleAction(null, roleForm(target.id, 'admin'))).toEqual({ ok: true })
  expect(await testDb.select().from(auditLog).where(eq(auditLog.action, 'member.role'))).toHaveLength(0)
})
