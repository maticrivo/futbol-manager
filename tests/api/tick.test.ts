import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { resetDb, testDb } from '../db'

const mocks = vi.hoisted(() => ({
  transportSpy: vi.fn().mockResolvedValue({ statusCode: 201 }),
  db: null as unknown,
}))

vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>()
  return { ...actual, getDb: () => mocks.db }
})

vi.mock('@/lib/push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/push')>()
  return { ...actual, defaultTransport: mocks.transportSpy }
})

import { POST } from '@/app/api/tick/route'

const ORIGINAL_SECRET = process.env.TICK_SECRET

function tickRequest(authorization?: string) {
  const headers = new Headers()
  if (authorization) headers.set('authorization', authorization)
  return POST(new Request('http://localhost/api/tick', { method: 'POST', headers }))
}

beforeEach(async () => {
  await resetDb()
  mocks.db = testDb
  process.env.TICK_SECRET = 'secret'
  mocks.transportSpy.mockClear()
})

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.TICK_SECRET
  else process.env.TICK_SECRET = ORIGINAL_SECRET
})

it('rejects a missing Authorization header without ticking', async () => {
  const res = await tickRequest()
  expect(res.status).toBe(401)
  expect(mocks.transportSpy).not.toHaveBeenCalled()
})

it('rejects a wrong token', async () => {
  const res = await tickRequest('Bearer wrong')
  expect(res.status).toBe(401)
})

it('rejects when TICK_SECRET is unset even with a Bearer undefined header', async () => {
  delete process.env.TICK_SECRET
  const res = await tickRequest('Bearer undefined')
  expect(res.status).toBe(401)
})

it('rejects a whitespace-only TICK_SECRET even when the header matches it', async () => {
  process.env.TICK_SECRET = '   '
  const res = await tickRequest(`Bearer ${process.env.TICK_SECRET}`)
  expect(res.status).toBe(401)
  expect(mocks.transportSpy).not.toHaveBeenCalled()
})

it('runs the tick with the correct token and returns all four counts', async () => {
  const res = await tickRequest('Bearer secret')
  expect(res.status).toBe(200)

  const body = await res.json()
  expect(typeof body.locked).toBe('number')
  expect(typeof body.matchesCreated).toBe('number')
  expect(typeof body.expiredOffers).toBe('number')
  expect(typeof body.notificationsSent).toBe('number')
  expect(body.matchesCreated).toBe(1)
  expect(body.locked).toBe(0)
})
