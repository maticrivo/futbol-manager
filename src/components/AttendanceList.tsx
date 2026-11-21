'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { setAttendanceAction } from '@/app/actions/admin'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

function ActionError({ code }: { code: string | null }) {
  const t = useTranslations()
  return (
    <div aria-live="polite" className="text-sm font-medium text-danger">
      {code !== null && (t.has('errors.' + code) ? t('errors.' + code) : t('errors.UNKNOWN'))}
    </div>
  )
}

function AttendanceRow({ matchId, entryId, name, attended, disabled }: {
  matchId: number
  entryId: number
  name: string
  attended: boolean | null
  disabled: boolean
}) {
  const t = useTranslations()
  const [state, formAction] = useActionState(setAttendanceAction, null)

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-4 shadow-subtle">
      <div className="flex items-center gap-3">
        <span className="font-medium text-ink">
          <bdi>{name}</bdi>
        </span>
        <Badge
          variant={attended === true ? 'success' : attended === false ? 'warning' : 'secondary'}
          size="sm"
        >
          {attended === null
            ? t('admin.match.attendance.unset')
            : attended ? t('admin.match.attendance.present') : t('admin.match.attendance.absent')}
        </Badge>
      </div>

      {!disabled && (
        <form action={formAction} className="flex items-center gap-1.5">
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="entryId" value={entryId} />
          <button
            type="submit" name="attended" value="present"
            className={`h-9 px-3 rounded-[var(--radius-md)] text-xs font-medium transition-colors border ${attended === true
              ? 'border-primary bg-primary text-white shadow-sm'
              : 'border-line bg-surface text-ink hover:bg-surface-muted'}`}
          >
            {t('admin.match.attendance.present')}
          </button>
          <button
            type="submit" name="attended" value="absent"
            className={`h-9 px-3 rounded-[var(--radius-md)] text-xs font-medium transition-colors border ${attended === false
              ? 'border-warning bg-warning text-white shadow-sm'
              : 'border-line bg-surface text-ink hover:bg-surface-muted'}`}
          >
            {t('admin.match.attendance.absent')}
          </button>
        </form>
      )}
      <ActionError code={state?.ok === false ? state.code : null} />
    </li>
  )
}

export default function AttendanceList({ matchId, attendees, disabled }: {
  matchId: number
  attendees: { entryId: number; name: string; attended: boolean | null }[]
  disabled: boolean
}) {
  const t = useTranslations()

  return (
    <Card variant="default" padding="lg" className="space-y-4">
      <h2 className="text-xl font-semibold text-ink">{t('admin.match.attendance.title')}</h2>
      {disabled && (
        <p className="text-sm text-muted">{t('admin.match.attendance.disabled')}</p>
      )}
      {attendees.length === 0 ? (
        <p className="text-muted">{t('admin.match.attendance.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {attendees.map(attendee => (
            <AttendanceRow
              key={attendee.entryId}
              matchId={matchId}
              entryId={attendee.entryId}
              name={attendee.name}
              attended={attendee.attended}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}
