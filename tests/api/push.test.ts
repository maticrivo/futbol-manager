import { eq } from 'drizzle-orm'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMember } from '@/domain/members'
import { pushSubscriptions } from '@/db/schema'
import { resetDb, testDb } from '../db'

const mocks = vi.hoisted(() => ({
  member: null as { id: string } | null,
  db: null as unknown,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentMember: async () => mocks.member,
}))

vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>()
  return { ...actual, getDb: () => mocks.db }
})

import { DELETE, POST } from '@/app/api/push/subscribe/route'

const endpoint = 'https://push.example.com/subscription/abc'
const validBody = {
  endpoint,
  keys: { p256dh: 'BNP0kI9gWs7pFRmJPi0m9mJAPzjM9vF8a0K0yX4V0kU', auth: 'xqV4z1K7P2mN8tR3' },
}

function jsonRequest(method: 'POST' | 'DELETE', body?: unknown) {
  return new Request('http://localhost/api/push/subscribe', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(async () => {
  await resetDb()
  mocks.db = testDb
  mocks.member = null
})

it('POST returns 401 without a member', async () => {
  const res = await POST(jsonRequest('POST', validBody))
  expect(res.status).toBe(401)
  expect(res.headers.get('content-type')).toContain('application/json')
  expect(await res.json()).toEqual({ error: 'unauthorized' })
})

it('DELETE returns 401 without a member', async () => {
  const res = await DELETE(jsonRequest('DELETE', { endpoint }))
  expect(res.status).toBe(401)
})

it('POST returns 400 for malformed JSON', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  mocks.member = member
  const res = await POST(new Request('http://localhost/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not json',
  }))
  expect(res.status).toBe(400)
  expect(res.headers.get('content-type')).toContain('application/json')
  expect(await res.json()).toEqual({ error: 'invalid json' })
})

it('POST returns 400 for missing keys or a non-https endpoint', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  mocks.member = member

  expect((await POST(jsonRequest('POST', { endpoint }))).status).toBe(400)
  expect((await POST(jsonRequest('POST', { endpoint: 'http://push.example.com/x', keys: validBody.keys }))).status).toBe(400)
  expect((await POST(jsonRequest('POST', { endpoint, keys: { p256dh: '', auth: validBody.keys.auth } }))).status).toBe(400)
  expect((await POST(jsonRequest('POST', { endpoint, keys: { p256dh: validBody.keys.p256dh, auth: '' } }))).status).toBe(400)
})

it('POST returns 400 and saves nothing for an oversized p256dh (256 chars)', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  mocks.member = member

  const res = await POST(jsonRequest('POST', {
    endpoint,
    keys: { p256dh: 'p'.repeat(256), auth: validBody.keys.auth },
  }))
  expect(res.status).toBe(400)

  const rows = await testDb.select().from(pushSubscriptions)
  expect(rows).toHaveLength(0)
})

it('POST returns 400 and saves nothing for an oversized endpoint (501 chars)', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  mocks.member = member

  const longEndpoint = 'https://push.example.com/' + 'a'.repeat(501 - 'https://push.example.com/'.length)
  const res = await POST(jsonRequest('POST', { endpoint: longEndpoint, keys: validBody.keys }))
  expect(res.status).toBe(400)

  const rows = await testDb.select().from(pushSubscriptions)
  expect(rows).toHaveLength(0)
})

it('POST saves a row and returns 204 for a valid subscription', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  mocks.member = member

  const res = await POST(jsonRequest('POST', validBody))
  expect(res.status).toBe(204)

  const rows = await testDb.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
  expect(rows).toHaveLength(1)
  expect(rows[0].memberId).toBe(member.id)
  expect(rows[0].p256dh).toBe(validBody.keys.p256dh)
  expect(rows[0].auth).toBe(validBody.keys.auth)
})

it('DELETE for another member returns 204 but leaves the row intact', async () => {
  const a = (await createMember(testDb, { name: 'Ana' })).member
  const b = (await createMember(testDb, { name: 'Bo' })).member

  mocks.member = a
  await POST(jsonRequest('POST', validBody))

  mocks.member = b
  const res = await DELETE(jsonRequest('DELETE', { endpoint }))
  expect(res.status).toBe(204)

  const rows = await testDb.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
  expect(rows).toHaveLength(1)
  expect(rows[0].memberId).toBe(a.id)
})

it('DELETE for the owner removes the row and returns 204', async () => {
  const a = (await createMember(testDb, { name: 'Ana' })).member
  mocks.member = a
  await POST(jsonRequest('POST', validBody))

  const res = await DELETE(jsonRequest('DELETE', { endpoint }))
  expect(res.status).toBe(204)

  const rows = await testDb.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
  expect(rows).toHaveLength(0)
})
