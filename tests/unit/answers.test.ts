import { expect, it } from 'vitest'
import type { Entry } from '@/domain/entries'
import type { MatchPhase } from '@/domain/matchView'
import type { MatchResponse } from '@/domain/responses'
import { answerActions, responseChip } from '@/lib/answers'

const row = (status: Entry['status']) => ({ id: 1, status }) as Entry

type State = {
  phase?: MatchPhase
  spotsLeft?: number
  myResponse?: MatchResponse
  myEntry?: Entry | null
  myQueueEntry?: Entry | null
  myOffer?: Entry | null
}

const view = (state: State) => ({
  phase: 'open' as MatchPhase,
  spotsLeft: 3,
  myResponse: 'unanswered' as MatchResponse,
  myEntry: null,
  myQueueEntry: null,
  myOffer: null,
  ...state,
})

const unanswered = {}
const confirmed = { myResponse: 'going', myEntry: row('confirmed') } as const
const queued = { myResponse: 'going', myQueueEntry: row('queued'), spotsLeft: 0 } as const
const offered = { myResponse: 'going', myOffer: row('offered') } as const
const declined = { myResponse: 'not_going' } as const

it.each([
  ['unanswered with spots', unanswered, ['signup', 'decline'], 'unanswered'],
  ['unanswered and full', { spotsLeft: 0 }, ['join', 'decline'], 'unanswered'],
  ['confirmed', confirmed, ['withdraw'], 'going'],
  ['queued (actions live in the waiting-list card)', queued, [], 'queued'],
  ['offered (the offer card carries the status and actions)', offered, [], null],
  ['declined with spots', declined, ['signup', 'undecided'], 'notGoing'],
  ['declined and full', { ...declined, spotsLeft: 0 }, ['join', 'undecided'], 'notGoing'],
] as const)('answer area while signups are open: %s', (_, state, actions, chip) => {
  for (const phase of ['open', 'guest'] as const) {
    expect(answerActions(view({ ...state, phase }))).toEqual(actions)
    expect(responseChip(view({ ...state, phase }))).toBe(chip)
  }
})

it('offers no answers before signups open, but keeps withdrawal for an early admin addition', () => {
  expect(answerActions(view({ phase: 'before' }))).toEqual([])
  expect(answerActions(view({ ...confirmed, phase: 'before' }))).toEqual(['withdraw'])
  expect(responseChip(view({ ...confirmed, phase: 'before' }))).toBeNull()
})

it.each(['locked', 'played', 'cancelled'] as const)('offers no answers when the match is %s', phase => {
  for (const state of [unanswered, confirmed, queued, offered, declined]) {
    expect(answerActions(view({ ...state, phase }))).toEqual([])
    expect(responseChip(view({ ...state, phase }))).toBeNull()
  }
})
