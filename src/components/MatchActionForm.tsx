'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import {
  addGuestAction, claimOfferAction, joinQueueAction, leaveQueueAction, removeGuestAction, signupAction, withdrawAction,
} from '@/app/actions/match'
import { Button } from './ui/Button'
import { Field } from './ui/Field'
import { InlineMessage } from './ui/InlineMessage'

const actions = {
  signup: signupAction,
  withdraw: withdrawAction,
  join: joinQueueAction,
  leave: leaveQueueAction,
  claim: claimOfferAction,
  addGuest: addGuestAction,
  removeGuest: removeGuestAction,
}

const labels = {
  signup: 'match.signup',
  withdraw: 'match.withdraw',
  join: 'queue.join',
  leave: 'queue.leave',
  claim: 'queue.claim',
  addGuest: 'match.addGuest',
  removeGuest: 'match.removeGuest',
} as const

type FormProps = { matchId: number } & (
  | { intent: 'withdraw' | 'claim' | 'removeGuest'; entryId: number }
  | { intent: 'signup' | 'join' | 'leave' | 'addGuest'; entryId?: never }
)

function ActionError({ code }: { code: string | null }) {
  const t = useTranslations()
  if (code === null) return null
  return (
    <InlineMessage variant="danger" className="mt-2 text-xs">
      {t.has('errors.' + code) ? t('errors.' + code) : t('errors.UNKNOWN')}
    </InlineMessage>
  )
}

export default function MatchActionForm({ intent, matchId, entryId }: FormProps) {
  const t = useTranslations()
  const [state, formAction] = useActionState(actions[intent], null)

  const isPrimary = intent === 'signup' || intent === 'claim'
  const isDanger = intent === 'withdraw' || intent === 'leave' || intent === 'removeGuest'

  if (intent === 'removeGuest') {
    return (
      <form action={formAction}>
        <input type="hidden" name="matchId" value={matchId} />
        {entryId !== undefined && <input type="hidden" name="entryId" value={entryId} />}
        <Button type="submit" variant="ghost" size="sm" className="text-danger hover:bg-danger-soft">
          {t(labels[intent])}
        </Button>
        <ActionError code={state?.ok === false ? state.code : null} />
      </form>
    )
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="matchId" value={matchId} />
      {entryId !== undefined && <input type="hidden" name="entryId" value={entryId} />}
      {intent === 'addGuest' && (
        <Field label={t('match.guestName')}>
          <input
            name="guestName"
            dir="auto"
            required
            maxLength={120}
            className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-ink text-sm focus:outline-none focus:ring-2 focus:ring-focus"
            placeholder={t('match.guestNamePlaceholder') || 'Guest full name'}
          />
        </Field>
      )}
      <Button
        type="submit"
        variant={isDanger ? 'outline' : isPrimary ? 'primary' : 'secondary'}
        size="md"
        className={isDanger ? 'border-danger/30 text-danger hover:bg-danger-soft w-full sm:w-auto' : 'w-full sm:w-auto'}
      >
        {t(labels[intent])}
      </Button>
      <ActionError code={state?.ok === false ? state.code : null} />
    </form>
  )
}
