import { expect, it } from 'vitest'
import { generateToken, hashToken } from '@/lib/tokens'

it('generates unique tokens and hashes deterministically', () => {
  const a = generateToken()
  const b = generateToken()
  expect(a).not.toBe(b)
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(hashToken(a)).toHaveLength(64)
  expect(hashToken(a)).toBe(hashToken(a))
})
