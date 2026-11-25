'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { linkMemberAction } from '@/app/actions/admin'
import SubmitButton from './SubmitButton'
import { Field } from './ui/Field'

export default function LinkMemberForm({
  pendingId,
  targets,
}: {
  pendingId: string
  targets: { id: string; name: string }[]
}) {
  const t = useTranslations()
  const [state, action] = useActionState(linkMemberAction, null)

  return (
    <form action={action} className="space-y-3 rounded-md border border-line p-3">
      <input type="hidden" name="pendingId" value={pendingId} />
      <p className="text-sm font-medium text-ink">{t('admin.members.linkTo')}</p>
      <Field label={t('admin.members.linkTarget')} required>
        <select
          name="targetId"
          required
          defaultValue=""
          className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <option value="" disabled>
            {t('admin.members.chooseTarget')}
          </option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name}
            </option>
          ))}
        </select>
      </Field>
      <SubmitButton label={t('admin.members.link')} pendingLabel={t('admin.members.linking')} />

      {state?.ok === true && (
        <div aria-live="polite" className="text-sm text-primary">
          {t('admin.members.linked')}
        </div>
      )}
      {state?.ok === false && (
        <div aria-live="polite" className="text-sm text-danger">
          {t.has('errors.' + state.code) ? t('errors.' + state.code) : t('errors.UNKNOWN')}
        </div>
      )}
    </form>
  )
}
