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
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

function ActionError({ code }: { code: string | null }) {
  const t = useTranslations()
  return (
    <div aria-live="polite" className="text-sm font-medium text-danger">
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
    return <p className="text-sm text-muted">{t('admin.match.roster.noAddable')}</p>
  }

  return (
    <form action={formAction} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 pt-2">
      <input type="hidden" name="matchId" value={matchId} />
      <Field label={t('admin.match.roster.addMember')} className="flex-1">
        <select name="memberId" required defaultValue="" className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <option value="" disabled>{t('admin.match.roster.choose')}</option>
          {members.map(member => (
            <option key={member.id} value={member.id}><bdi>{member.name}</bdi></option>
          ))}
        </select>
      </Field>
      <Field label={t('admin.match.roster.reason')} className="flex-1">
        <input name="reason" dir="auto" required={locked} className="h-11 w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" />
      </Field>
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
        className="h-9 rounded-[var(--radius-md)] border border-line bg-surface px-2.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      />
      <Button type="submit" variant="danger" size="sm">
        {t('admin.match.roster.remove')}
      </Button>
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
        className="h-9 rounded-[var(--radius-md)] border border-line bg-surface px-2.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      />
      <Button type="submit" variant="outline" size="sm">
        {t('admin.match.roster.waive')}
      </Button>
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
      <Button type="submit" variant="outline" size="sm">
        {t('admin.match.roster.restore')}
      </Button>
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
    <Card variant="default" padding="lg" className="space-y-4">
      <h2 className="text-xl font-semibold text-ink">{t('admin.match.roster.title')}</h2>
      {disabled && (
        <p className="text-sm text-muted">{t('admin.match.roster.finished')}</p>
      )}

      {rows.length === 0 ? (
        <p className="text-muted">{t('admin.match.roster.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(row => (
            <li key={row.entryId} className="rounded-[var(--radius-md)] border border-line bg-surface p-4 space-y-3 shadow-subtle">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">
                    <bdi>{row.name}</bdi>
                  </span>
                  {row.kind === 'guest' && (
                    <Badge variant="secondary" size="sm">Guest</Badge>
                  )}
                  {row.kind === 'guest' && row.hostName && (
                    <span className="text-xs text-muted">
                      {t('admin.match.roster.guestOfLabel')} <bdi>{row.hostName}</bdi>
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {row.charge && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-ink">
                        <bdi>{row.charge.amount}</bdi>
                      </span>
                      {row.charge.status === 'waived' && (
                        <Badge variant="secondary" size="sm">{t('admin.match.roster.waived')}</Badge>
                      )}
                    </div>
                  )}
                  {!disabled && <RemoveEntry matchId={matchId} entryId={row.entryId} />}
                </div>
              </div>
              {row.charge && !disabled && (
                <div className="pt-2 border-t border-line">
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
    </Card>
  )
}
