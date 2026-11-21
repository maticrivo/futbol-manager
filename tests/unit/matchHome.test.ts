import { expect, it } from 'vitest'
import { matchPhaseTone } from '@/components/MatchHero'

it('maps match phases to badge tones', () => {
  expect(matchPhaseTone('open')).toBe('success')
  expect(matchPhaseTone('locked')).toBe('neutral')
  expect(matchPhaseTone('cancelled')).toBe('danger')
})
