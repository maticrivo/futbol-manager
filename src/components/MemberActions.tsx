'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { regenerateInviteAction, setMemberStatusAction } from '@/app/actions/admin'
import InviteLink from './InviteLink'

function ActionError({ code }: { code: string | null }) {
  const t = useTranslations()
  return (
    <div aria-live="polite" className="text-sm text-red-700 dark:text-red-300">
      {code !== null && (t.has('errors.' + code) ? t('errors.' + code) : t('errors.UNKNOWN'))}
    </div>
  )
}

export default function MemberActions({
  memberId,
  isSelf,
  status,
}: {
  memberId: number
  isSelf: boolean
  status: 'active' | 'disabled'
}) {
  const t = useTranslations()
  const [regenState, regenAction] = useActionState(regenerateInviteAction, null)
  const [statusState, statusAction] = useActionState(setMemberStatusAction, null)

  const nextStatus = status === 'active' ? 'disabled' : 'active'
  const canDisable = !(isSelf && status === 'active')

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <form action={regenAction}>
          <input type="hidden" name="memberId" value={memberId} />
          <button type="submit" className="cursor-pointer text-sm underline">
            {t('admin.members.regenerate')}
          </button>
        </form>
        <form action={statusAction}>
          <input type="hidden" name="memberId" value={memberId} />
          <input type="hidden" name="status" value={nextStatus} />
          {canDisable ? (
            <button type="submit" className="cursor-pointer text-sm underline">
              {status === 'active' ? t('admin.members.disable') : t('admin.members.enable')}
            </button>
          ) : (
            <span className="text-sm text-neutral-500 dark:text-neutral-400">{t('admin.members.selfNote')}</span>
          )}
        </form>
      </div>
      {regenState?.ok && <InviteLink url={regenState.inviteUrl} />}
      <ActionError code={regenState?.ok === false ? regenState.code : null} />
      <ActionError code={statusState?.ok === false ? statusState.code : null} />
    </div>
  )
}
