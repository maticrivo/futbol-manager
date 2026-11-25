'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { setMemberRoleAction, setMemberStatusAction } from '@/app/actions/admin'
import SubmitButton from './SubmitButton'

function ActionError({ code }: { code: string | null }) {
  const t = useTranslations()
  return (
    <div aria-live="polite" className="text-sm text-danger mt-1">
      {code !== null && (t.has('errors.' + code) ? t('errors.' + code) : t('errors.UNKNOWN'))}
    </div>
  )
}

export default function MemberActions({
  memberId,
  isSelf,
  status,
  role,
  isSuperuser,
}: {
  memberId: string
  isSelf: boolean
  status: 'active' | 'disabled' | 'pending'
  role: 'member' | 'admin'
  isSuperuser: boolean
}) {
  const t = useTranslations()
  const [statusState, statusAction] = useActionState(setMemberStatusAction, null)
  const [roleState, roleAction] = useActionState(setMemberRoleAction, null)

  const canDisable = !(isSelf && status === 'active')

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {status === 'pending' && (
          <>
            <form action={statusAction}>
              <input type="hidden" name="memberId" value={memberId} />
              <input type="hidden" name="status" value="active" />
              <SubmitButton
                label={t('admin.members.approve')}
                pendingLabel={t('admin.members.working')}
                primary
              />
            </form>
            <form action={statusAction}>
              <input type="hidden" name="memberId" value={memberId} />
              <input type="hidden" name="status" value="disabled" />
              <SubmitButton
                label={t('admin.members.disable')}
                pendingLabel={t('admin.members.working')}
              />
            </form>
          </>
        )}
        {status === 'active' && (
          <form action={statusAction}>
            <input type="hidden" name="memberId" value={memberId} />
            <input type="hidden" name="status" value="disabled" />
            {canDisable ? (
              <SubmitButton
                label={t('admin.members.disable')}
                pendingLabel={t('admin.members.working')}
              />
            ) : (
              <span className="text-sm text-muted">{t('admin.members.selfNote')}</span>
            )}
          </form>
        )}
        {status === 'disabled' && (
          <form action={statusAction}>
            <input type="hidden" name="memberId" value={memberId} />
            <input type="hidden" name="status" value="active" />
            <SubmitButton
              label={t('admin.members.enable')}
              pendingLabel={t('admin.members.working')}
            />
          </form>
        )}
      </div>
      <ActionError code={statusState?.ok === false ? statusState.code : null} />

      <div className="flex flex-wrap items-center gap-2">
        {role === 'admin' ? (
          isSuperuser ? (
            <span className="text-sm text-muted">{t('admin.members.superuserNote')}</span>
          ) : isSelf ? (
            <span className="text-sm text-muted">{t('admin.members.selfRoleNote')}</span>
          ) : (
            <form action={roleAction}>
              <input type="hidden" name="memberId" value={memberId} />
              <input type="hidden" name="role" value="member" />
              <SubmitButton
                label={t('admin.members.removeAdmin')}
                pendingLabel={t('admin.members.working')}
              />
            </form>
          )
        ) : status === 'active' ? (
          <form action={roleAction}>
            <input type="hidden" name="memberId" value={memberId} />
            <input type="hidden" name="role" value="admin" />
            <SubmitButton
              label={t('admin.members.makeAdmin')}
              pendingLabel={t('admin.members.working')}
            />
          </form>
        ) : null}
      </div>
      <ActionError code={roleState?.ok === false ? roleState.code : null} />
    </div>
  )
}
