'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { setAttendanceAction } from '@/app/actions/admin'

function ActionError({ code }: { code: string | null }) {
  const t = useTranslations()
  return (
    <div aria-live="polite" className="text-sm text-red-700 dark:text-red-300">
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
    <li className="flex flex-wrap items-center justify-between gap-2">
      <bdi>{name}</bdi>
      <span className="text-sm text-neutral-600 dark:text-neutral-300">
        {attended === null
          ? t('admin.match.attendance.unset')
          : attended ? t('admin.match.attendance.present') : t('admin.match.attendance.absent')}
      </span>
      {!disabled && (
        <form action={formAction} className="flex items-center gap-1">
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="entryId" value={entryId} />
          <button
            type="submit" name="attended" value="present"
            className={`rounded-md border px-3 py-1 ${attended === true
              ? 'border-emerald-700 bg-emerald-700 text-white'
              : 'hover:bg-current/5'}`}
          >
            {t('admin.match.attendance.present')}
          </button>
          <button
            type="submit" name="attended" value="absent"
            className={`rounded-md border px-3 py-1 ${attended === false
              ? 'border-amber-700 bg-amber-700 text-white'
              : 'hover:bg-current/5'}`}
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
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">{t('admin.match.attendance.title')}</h2>
      {disabled && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('admin.match.attendance.disabled')}</p>
      )}
      {attendees.length === 0 ? (
        <p className="text-neutral-600 dark:text-neutral-300">{t('admin.match.attendance.empty')}</p>
      ) : (
        <ul className="space-y-2">
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
    </section>
  )
}
