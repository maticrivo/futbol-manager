'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import {
  adminAddEntryAction,
  adminRemoveEntryAction,
  restoreChargeAction,
  waiveChargeAction,
} from '@/app/actions/admin'
import SubmitButton from './SubmitButton'

function ActionError({ code }: { code: string | null }) {
  const t = useTranslations()
  return (
    <div aria-live="polite" className="text-sm text-red-700 dark:text-red-300">
      {code !== null && (t.has('errors.' + code) ? t('errors.' + code) : t('errors.UNKNOWN'))}
    </div>
  )
}

export type RosterRow = {
  entryId: number
  name: string
  hostName: string | null
  kind: 'member' | 'guest'
  charge: { id: number; amount: string; status: 'charged' | 'waived' } | null
}

function AddMemberForm({ matchId, members, locked }: {
  matchId: number
  members: { id: number; name: string }[]
  locked: boolean
}) {
  const t = useTranslations()
  const [state, formAction] = useActionState(adminAddEntryAction, null)

  if (members.length === 0) {
    return <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('admin.match.roster.noAddable')}</p>
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="matchId" value={matchId} />
      <label className="block">
        <span className="block text-sm font-medium">{t('admin.match.roster.addMember')}</span>
        <select name="memberId" required defaultValue="" className="mt-1 rounded border px-3 py-2">
          <option value="" disabled>{t('admin.match.roster.choose')}</option>
          {members.map(member => (
            <option key={member.id} value={member.id}><bdi>{member.name}</bdi></option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-sm font-medium">{t('admin.match.roster.reason')}</span>
        <input name="reason" dir="auto" required={locked} className="mt-1 rounded border px-3 py-2" />
      </label>
      <SubmitButton label={t('admin.match.roster.add')} pendingLabel={t('admin.match.roster.adding')} primary />
      <ActionError code={state?.ok === false ? state.code : null} />
    </form>
  )
}

function RemoveEntry({ matchId, entryId }: { matchId: number; entryId: number }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(adminRemoveEntryAction, null)
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="entryId" value={entryId} />
      <input
        name="reason" dir="auto" required placeholder={t('admin.match.roster.reason')}
        className="rounded border px-2 py-1"
      />
      <SubmitButton label={t('admin.match.roster.remove')} pendingLabel={t('admin.match.roster.removing')} />
      <ActionError code={state?.ok === false ? state.code : null} />
    </form>
  )
}

function WaiveCharge({ matchId, chargeId }: { matchId: number; chargeId: number }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(waiveChargeAction, null)
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="chargeId" value={chargeId} />
      <input
        name="reason" dir="auto" required placeholder={t('admin.match.roster.reason')}
        className="rounded border px-2 py-1"
      />
      <SubmitButton label={t('admin.match.roster.waive')} pendingLabel={t('admin.match.roster.working')} />
      <ActionError code={state?.ok === false ? state.code : null} />
    </form>
  )
}

function RestoreCharge({ matchId, chargeId }: { matchId: number; chargeId: number }) {
  const t = useTranslations()
  const [state, formAction] = useActionState(restoreChargeAction, null)
  return (
    <form action={formAction}>
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="chargeId" value={chargeId} />
      <SubmitButton label={t('admin.match.roster.restore')} pendingLabel={t('admin.match.roster.working')} />
      <ActionError code={state?.ok === false ? state.code : null} />
    </form>
  )
}

export default function AdminRoster({ matchId, rows, members, locked, disabled }: {
  matchId: number
  rows: RosterRow[]
  members: { id: number; name: string }[]
  locked: boolean
  disabled: boolean
}) {
  const t = useTranslations()

  return (
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">{t('admin.match.roster.title')}</h2>
      {disabled && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('admin.match.roster.finished')}</p>
      )}

      {rows.length === 0 ? (
        <p className="text-neutral-600 dark:text-neutral-300">{t('admin.match.roster.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(row => (
            <li key={row.entryId} className="rounded border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <bdi>{row.name}</bdi>
                  {row.kind === 'guest' && row.hostName && (
                    <span className="ms-2 text-sm">{t('admin.match.roster.guestOfLabel')} <bdi>{row.hostName}</bdi></span>
                  )}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  {row.charge && (
                    <span className="text-sm">
                      <bdi>{row.charge.amount}</bdi>
                      {row.charge.status === 'waived' && (
                        <span className="ms-2 text-neutral-500 dark:text-neutral-400">{t('admin.match.roster.waived')}</span>
                      )}
                    </span>
                  )}
                  {!disabled && <RemoveEntry matchId={matchId} entryId={row.entryId} />}
                </div>
              </div>
              {row.charge && !disabled && (
                <div className="mt-2">
                  {row.charge.status === 'charged'
                    ? <WaiveCharge matchId={matchId} chargeId={row.charge.id} />
                    : <RestoreCharge matchId={matchId} chargeId={row.charge.id} />}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && <AddMemberForm matchId={matchId} members={members} locked={locked} />}
    </section>
  )
}
