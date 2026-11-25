import { expect, it } from 'vitest'
import { vi } from 'vitest'
import { isAdminTabActive, isPrimaryNavActive } from '@/components/Nav'

vi.mock('@/auth', () => ({
  auth: vi.fn(async () => null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}))

it('determines active nav state correctly', () => {
  expect(isAdminTabActive('/admin/matches/3')).toBe(true)
  expect(isPrimaryNavActive('/', '/')).toBe(true)
  expect(isPrimaryNavActive('/bill', '/')).toBe(false)
})
