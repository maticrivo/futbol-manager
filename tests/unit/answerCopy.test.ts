import { expect, it } from 'vitest'
import en from '../../messages/en.json'
import es from '../../messages/es.json'
import he from '../../messages/he.json'

const keys = [
  'match.decline', 'match.notSure',
  'match.response.unanswered', 'match.response.going', 'match.response.queued', 'match.response.notGoing',
  'responses.notGoing', 'responses.notGoingEmpty', 'responses.unanswered', 'responses.unansweredEmpty',
  'errors.NOT_DECLINED',
]

function lookup(messages: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages)
}

it.each([['en', en], ['es', es], ['he', he]] as const)('has every voy / no voy string in %s', (_, messages) => {
  for (const key of keys) {
    const value = lookup(messages, key)
    expect(typeof value === 'string' && value.trim().length > 0, key).toBe(true)
  }
  expect(lookup(messages, 'match.withdraw')).toBeUndefined()
})
