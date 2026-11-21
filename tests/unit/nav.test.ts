import { expect, it } from 'vitest'
import { isAdminTabActive, isPrimaryNavActive } from '@/components/Nav'

it('determines active nav state correctly', () => {
  expect(isAdminTabActive('/admin/matches/3')).toBe(true)
  expect(isPrimaryNavActive('/', '/')).toBe(true)
  expect(isPrimaryNavActive('/bill', '/')).toBe(false)
})
