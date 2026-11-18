import { getTranslations } from 'next-intl/server'
import type { MatchPhase, MatchRosterEntry } from '@/domain/matchView'
import MatchActionForm from './MatchActionForm'

export default async function RosterList({
  roster, matchId, myEntryId, memberId, asAdmin, phase,
}: {
  roster: MatchRosterEntry[]
  matchId: number
  myEntryId: number | null
  memberId: number
  asAdmin: boolean
  phase: MatchPhase
}) {
  const t = await getTranslations('match')
  const editable = phase !== 'locked' && phase !== 'played' && phase !== 'cancelled'
  return (
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">{t('roster')}</h2>
      {roster.length === 0 ? <p>{t('rosterEmpty')}</p> : (
        <ul className="space-y-1">
          {roster.map(entry => (
            <li key={entry.id} className={`flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1 ${
              entry.id === myEntryId ? 'bg-emerald-100 font-semibold dark:bg-emerald-950' : ''
            }`}>
              <span>
                <bdi>{entry.kind === 'guest' ? entry.guestName : entry.memberName}</bdi>
                {entry.id === myEntryId && <span className="ms-2 text-sm">{t('you')}</span>}
                {entry.kind === 'guest' && (
                  <span className="ms-2 text-sm">
                    {entry.hostName
                      ? t.rich('guestOf', { host: entry.hostName, bidi: chunks => <bdi>{chunks}</bdi> })
                      : t('guest')}
                  </span>
                )}
              </span>
              {editable && entry.kind === 'guest' && (asAdmin || entry.hostMemberId === memberId) && (
                <MatchActionForm intent="removeGuest" matchId={matchId} entryId={entry.id} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
