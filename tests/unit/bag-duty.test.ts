import { expect, it } from 'vitest'
import { bagTakerOptions } from '@/lib/bag-duty'

it('appends an off-roster actual taker', () => {
  const options = bagTakerOptions(
    [{ id: 'ana', name: 'Ana' }, { id: 'beto', name: 'Beto' }],
    { memberId: 'caro', name: 'Carolina', nickname: '  Caro ' },
  )

  expect(options).toEqual([
    { id: 'ana', name: 'Ana', offRoster: false },
    { id: 'beto', name: 'Beto', offRoster: false },
    { id: 'caro', name: 'Caro', offRoster: true },
  ])
})

it('falls back to the real name when the off-roster taker has no nickname', () => {
  const options = bagTakerOptions([], { memberId: 'caro', name: 'Caro', nickname: '   ' })
  expect(options).toEqual([{ id: 'caro', name: 'Caro', offRoster: true }])
})

it('does not duplicate an actual taker who is still on the roster', () => {
  const options = bagTakerOptions([{ id: 'ana', name: 'Ana' }], { memberId: 'ana', name: 'Ana', nickname: null })
  expect(options).toEqual([{ id: 'ana', name: 'Ana', offRoster: false }])
})

it('returns the roster unchanged without a recorded taker', () => {
  const options = bagTakerOptions([{ id: 'ana', name: 'Ana' }], null)
  expect(options).toEqual([{ id: 'ana', name: 'Ana', offRoster: false }])
})
