'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import {
  addGuestAction, claimOfferAction, joinQueueAction, leaveQueueAction, removeGuestAction, signupAction, withdrawAction,
} from '@/app/actions/match'
import SubmitButton from './SubmitButton'

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
  return (
    <div aria-live="polite" className="text-sm text-red-700 dark:text-red-300">
      {code !== null && (t.has('errors.' + code) ? t('errors.' + code) : t('errors.UNKNOWN'))}
    </div>
  )
}

export default function MatchActionForm({ intent, matchId, entryId }: FormProps) {
  const t = useTranslations()
  const [state, formAction] = useActionState(actions[intent], null)
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="matchId" value={matchId} />
      {entryId !== undefined && <input type="hidden" name="entryId" value={entryId} />}
      {intent === 'addGuest' && (
        <label className="block">
          <span className="block text-sm font-medium">{t('match.guestName')}</span>
          <input name="guestName" dir="auto" required maxLength={120} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
      )}
      <SubmitButton label={t(labels[intent])} pendingLabel={t('match.submitting')} primary={intent === 'signup' || intent === 'claim'} />
      <ActionError code={state?.ok === false ? state.code : null} />
    </form>
  )
}
