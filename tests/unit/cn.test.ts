import { expect, it } from 'vitest'
import { cn } from '@/lib/cn'

it('merges class names correctly', () => {
  expect(cn('foo bar', { baz: true, qux: false })).toBe('foo bar baz')
})
