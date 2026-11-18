import { beforeEach, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { signupAction, withdrawAction } from '@/app/actions/match'
import { signup } from '@/domain/entries'
import { createMatchForDate, getMatch } from '@/domain/matches'
import { createMember } from '@/domain/members'
import { requireMember } from '@/lib/auth'
import { resetDb, testDb } from '../db'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireMember: vi.fn() }))
vi.mock('@/db', async importOriginal => ({
  ...await importOriginal<typeof import('@/db')>(),
  getDb: () => testDb,
}))

beforeEach(async () => {
  vi.clearAllMocks()
  await resetDb()
})

function form(matchId: number, entryId?: number) {
  const data = new FormData()
  data.set('matchId', String(matchId))
  if (entryId !== undefined) data.set('entryId', String(entryId))
  return data
}

it('persists a crossed lock and revalidates even though signup fails', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const { member } = await createMember(testDb, { name: 'Ana' })
  vi.mocked(requireMember).mockResolvedValue(member)
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(match.lockAt)
    expect(await signupAction(null, form(match.id))).toEqual({ ok: false, code: 'MATCH_LOCKED' })
    expect((await getMatch(testDb, match.id))?.status).toBe('locked')
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith('/')
  } finally {
    vi.useRealTimers()
  }
})

it('does not revalidate malformed or mismatched IDs', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const other = await createMatchForDate(testDb, '2027-04-06')
  const { member } = await createMember(testDb, { name: 'Ana' })
  vi.mocked(requireMember).mockResolvedValue(member)
  const result = await signup(testDb, { matchId: match.id, memberId: member.id, now: match.signupOpensAt })
  if (!result.ok) throw new Error(`Fixture signup failed: ${result.code}`)

  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(other.lockAt)
    const notFound = { ok: false, code: 'NOT_FOUND' }
    expect(await signupAction(null, form(0))).toEqual(notFound)
    expect(await withdrawAction(null, form(match.id))).toEqual(notFound)
    expect(await withdrawAction(null, form(other.id, result.value.id))).toEqual(notFound)
    expect((await getMatch(testDb, match.id))?.status).toBe('scheduled')
    expect((await getMatch(testDb, other.id))?.status).toBe('scheduled')
    expect(revalidatePath).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})
