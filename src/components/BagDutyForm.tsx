'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { recordBagDutyAction } from '@/app/actions/admin'
import type { BagPerson } from '@/domain/matchView'
import SubmitButton from './SubmitButton'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { MemberName } from '@/components/ui/MemberName'

const SELECT_CLASS = 'h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'

function PersonLine({ label, person, muted = false }: { label: string; person: BagPerson; muted?: boolean }) {
  return (
    <p className={`text-sm ${muted ? 'text-muted' : 'text-ink'}`}>
      {label}{' '}
      <MemberName name={person.name} nickname={person.nickname} />
    </p>
  )
}

export default function BagDutyForm({ matchId, assigned, backup, actualMemberId, members, disabled }: {
  matchId: number
  assigned: BagPerson
  backup: BagPerson | null
  actualMemberId: string | null
  members: { id: string; name: string }[]
  disabled: boolean
}) {
  const t = useTranslations()
  const [state, formAction] = useActionState(recordBagDutyAction, null)

  return (
    <Card variant="default" padding="lg" className="space-y-4">
      <h2 className="text-xl font-semibold text-ink">{t('admin.match.bag.title')}</h2>

      <div className="space-y-1">
        <PersonLine label={t('admin.match.bag.assigned', { name: '' }).trim()} person={assigned} />
        {backup && <PersonLine label={t('admin.match.bag.backup', { name: '' }).trim()} person={backup} muted />}
      </div>

      {disabled ? (
        <p className="text-sm text-muted">{t('admin.match.bag.waiting')}</p>
      ) : (
        <form action={formAction} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <input type="hidden" name="matchId" value={matchId} />
          <Field label={t('admin.match.bag.actual')} className="flex-1">
            <select
              key={actualMemberId ?? ''}
              name="memberId"
              defaultValue={actualMemberId ?? ''}
              className={SELECT_CLASS}
            >
              <option value="">{t('admin.match.bag.none')}</option>
              {members.map(member => (
                <option key={member.id} value={member.id}><bdi>{member.name}</bdi></option>
              ))}
            </select>
          </Field>
          <SubmitButton label={t('admin.match.bag.save')} pendingLabel={t('admin.match.bag.saving')} primary />
        </form>
      )}

      {state?.ok === true && (
        <div aria-live="polite">
          <InlineMessage variant="success">{t('admin.match.bag.saved')}</InlineMessage>
        </div>
      )}

      {state?.ok === false && (
        <div aria-live="polite">
          <InlineMessage variant="danger">
            {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
          </InlineMessage>
        </div>
      )}
    </Card>
  )
}
