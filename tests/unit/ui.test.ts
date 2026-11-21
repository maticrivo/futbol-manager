import { expect, it } from 'vitest'
import { initials } from '@/components/ui/Avatar'

it('computes initials correctly for various names', () => {
  expect(initials('Noam Levi')).toBe('NL')
  expect(initials('Yossi')).toBe('YO')
  expect(initials('נועם לוי')).toBe('נל')
})
