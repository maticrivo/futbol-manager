import { beforeEach, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import {
  addMemberAction,
  createNextMatchAction,
  regenerateInviteAction,
  setMemberStatusAction,
  updateMemberAction,
  updateSettingsAction,
} from '@/app/actions/admin'
import { matches } from '@/db/schema'
import { createMember, listMembers, loginWithInvite } from '@/domain/members'
import { createMatchForDate, getSettings } from '@/domain/matches'
import { requireAdmin } from '@/lib/auth'
import { resetDb, testDb } from '../db'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ host: 'admin.example', 'x-forwarded-proto': 'https' })),
}))
vi.mock('@/db', async importOriginal => ({
  ...await importOriginal<typeof import('@/db')>(),
  getDb: () => testDb,
}))

const now = new Date('2027-03-27T10:00:00Z')

beforeEach(async () => {
  vi.clearAllMocks()
  await resetDb()
})

function idForm(memberId: number) {
  const data = new FormData()
  data.set('memberId', String(memberId))
  return data
}

function statusForm(memberId: number, status: string) {
  const data = idForm(memberId)
  data.set('status', status)
  return data
}

function addForm(name: string, role?: string, locale?: string) {
  const data = new FormData()
  data.set('name', name)
  if (role) data.set('role', role)
  if (locale) data.set('locale', locale)
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
  await expect(addMemberAction(null, addForm('Ghost'))).rejects.toThrow('NEXT_REDIRECT')
  expect(await listMembers(testDb)).toHaveLength(membersBefore)

  vi.mocked(requireAdmin).mockRejectedValueOnce(redirectError)
  await expect(createNextMatchAction(null, new FormData())).rejects.toThrow('NEXT_REDIRECT')
  expect(await matchDates()).toHaveLength(matchesBefore)
})

it('addMemberAction creates a member and returns a working invite URL', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const result = await addMemberAction(null, addForm('Ana', 'member', 'es'))
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.inviteUrl).toMatch(/^https:\/\/admin\.example\/login\/[A-Za-z0-9_-]{43}$/)

  const token = result.inviteUrl.split('/login/')[1]
  const login = await loginWithInvite(testDb, token, now)
  expect(login.ok).toBe(true)
  if (!login.ok) return
  expect(login.value.member.name).toBe('Ana')
  expect(login.value.member.locale).toBe('es')

  expect(revalidatePath).toHaveBeenCalledWith('/admin/members')
  expect(revalidatePath).toHaveBeenCalledWith('/admin')
})

it('addMemberAction rejects a blank or overlong name and creates nothing', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await addMemberAction(null, addForm('   '))).toEqual({ ok: false, code: 'INVALID_NAME' })
  expect(await addMemberAction(null, addForm('x'.repeat(81)))).toEqual({ ok: false, code: 'INVALID_NAME' })

  expect(await listMembers(testDb)).toHaveLength(1)
})

it('regenerateInviteAction returns a working new URL and invalidates the old token', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const target = await createMember(testDb, { name: 'Ana' })
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const result = await regenerateInviteAction(null, idForm(target.member.id))
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.inviteUrl).toMatch(/^https:\/\/admin\.example\/login\//)

  const newToken = result.inviteUrl.split('/login/')[1]
  expect((await loginWithInvite(testDb, newToken, now)).ok).toBe(true)
  expect(await loginWithInvite(testDb, target.inviteToken, now)).toEqual({ ok: false, code: 'INVALID_TOKEN' })
})

it('setMemberStatusAction disables and re-enables, and forbids disabling self', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const other = (await createMember(testDb, { name: 'Ana' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await setMemberStatusAction(null, statusForm(admin.id, 'disabled'))).toEqual({ ok: false, code: 'FORBIDDEN' })

  expect(await setMemberStatusAction(null, statusForm(other.id, 'disabled'))).toEqual({ ok: true })
  expect((await listMembers(testDb)).find((m) => m.id === other.id)!.status).toBe('disabled')

  expect(await setMemberStatusAction(null, statusForm(other.id, 'active'))).toEqual({ ok: true })
  expect((await listMembers(testDb)).find((m) => m.id === other.id)!.status).toBe('active')
})

it('setMemberStatusAction supports pending status and approving pending members', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const pendingMember = (await createMember(testDb, { name: 'Pending User', status: 'pending' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  // Admin cannot set themselves to pending
  expect(await setMemberStatusAction(null, statusForm(admin.id, 'pending'))).toEqual({ ok: false, code: 'FORBIDDEN' })

  // Admin approves pending member
  expect(await setMemberStatusAction(null, statusForm(pendingMember.id, 'active'))).toEqual({ ok: true })
  expect((await listMembers(testDb)).find((m) => m.id === pendingMember.id)!.status).toBe('active')

  // Admin can change status back to pending
  expect(await setMemberStatusAction(null, statusForm(pendingMember.id, 'pending'))).toEqual({ ok: true })
  expect((await listMembers(testDb)).find((m) => m.id === pendingMember.id)!.status).toBe('pending')

  // Invalid status returns NOT_FOUND
  expect(await setMemberStatusAction(null, statusForm(pendingMember.id, 'invalid'))).toEqual({ ok: false, code: 'NOT_FOUND' })
})

it('addMemberAction supports adding a member by email with pending status', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const emailForm = new FormData()
  emailForm.set('email', 'newplayer@example.com')
  emailForm.set('role', 'member')
  emailForm.set('locale', 'es')
  emailForm.set('status', 'pending')

  const result = await addMemberAction(null, emailForm)
  expect(result.ok).toBe(true)

  const created = (await listMembers(testDb)).find((m) => m.name === 'newplayer@example.com')
  expect(created).toBeDefined()
  expect(created?.status).toBe('pending')
  expect(created?.role).toBe('member')
  expect(created?.locale).toBe('es')
  expect(created?.email).toBe('newplayer@example.com')
})

it('addMemberAction sets the email identity and rejects invalid or duplicate emails', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const invalid = new FormData()
  invalid.set('email', 'not-an-email')
  expect(await addMemberAction(null, invalid)).toEqual({ ok: false, code: 'INVALID_EMAIL' })

  const first = new FormData()
  first.set('email', 'Taken@Example.com')
  expect((await addMemberAction(null, first)).ok).toBe(true)

  const duplicate = new FormData()
  duplicate.set('email', ' taken@example.com ')
  expect(await addMemberAction(null, duplicate)).toEqual({ ok: false, code: 'EMAIL_TAKEN' })

  const takenRows = (await listMembers(testDb)).filter((m) => m.email === 'taken@example.com')
  expect(takenRows).toHaveLength(1)
})

it('updateSettingsAction converts shekels to agorot and rejects malformed values', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await updateSettingsAction(null, settingsForm({ costShekels: '35.5' }))).toEqual({ ok: true })
  expect((await getSettings(testDb)).costAgorot).toBe(3550)

  const before = await getSettings(testDb)
  expect(await updateSettingsAction(null, settingsForm({ costShekels: '35.555' }))).toEqual({ ok: false, code: 'INVALID_SETTING' })
  expect(await updateSettingsAction(null, settingsForm({ costShekels: 'abc' }))).toEqual({ ok: false, code: 'INVALID_SETTING' })
  expect(await getSettings(testDb)).toEqual(before)
})

it('updateSettingsAction persists venue, kickoff and capacity', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
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
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  await createMatchForDate(testDb, '2027-03-30')

  expect(await createNextMatchAction(null, new FormData())).toEqual({ ok: true })
  expect(await matchDates()).toEqual(['2027-03-30', '2027-04-06'])

  expect(await createNextMatchAction(null, new FormData())).toEqual({ ok: true })
  expect(await matchDates()).toEqual(['2027-03-30', '2027-04-06', '2027-04-13'])
})

it('createNextMatchAction creates the next Tuesday when no match exists', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    // 2027-03-24 is a Wednesday in TZ; the next Tuesday is 2027-03-30.
    vi.setSystemTime(new Date('2027-03-24T12:00:00Z'))
    expect(await createNextMatchAction(null, new FormData())).toEqual({ ok: true })
  } finally {
    vi.useRealTimers()
  }

  expect(await matchDates()).toEqual(['2027-03-30'])
})

it('updateMemberAction updates member profile fields and revalidates paths', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const target = (await createMember(testDb, { name: 'OldName' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  const form = new FormData()
  form.set('memberId', String(target.id))
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
  expect(updatedTarget.email).toBe('newname@example.com')
  expect(updatedTarget.phone).toBe('+972 50 999 8888')
  expect(updatedTarget.image).toBe('https://example.com/avatar.jpg')
})
