import { getTranslations } from 'next-intl/server'
import type { MatchPhase, MatchRosterEntry } from '@/domain/matchView'
import MatchActionForm from './MatchActionForm'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/icons'

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
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
          <Icon name="users" size={18} className="text-primary" />
          {t('roster')}
        </h2>
        <Badge variant="secondary" size="sm">{roster.length}</Badge>
      </div>

      {roster.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">{t('rosterEmpty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {roster.map((entry, index) => {
            const isMe = entry.id === myEntryId
            return (
              <li key={entry.id} className={`py-2.5 flex items-center justify-between gap-3 text-sm ${
                isMe ? 'bg-primary-soft/50 -mx-4 px-4 rounded-[var(--radius-md)] font-medium text-primary' : 'text-ink'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted w-5 text-right font-mono">{index + 1}.</span>
                  <div>
                    <span className="font-medium">
                      <bdi>{entry.kind === 'guest' ? entry.guestName : entry.memberName}</bdi>
                    </span>
                    {isMe && <Badge variant="primary" size="sm" className="ms-2">{t('you')}</Badge>}
                    {entry.kind === 'guest' && (
                      <span className="ms-2 text-xs text-muted">
                        {entry.hostName
                          ? t.rich('guestOf', { host: entry.hostName, bidi: chunks => <bdi>{chunks}</bdi> })
                          : t('guest')}
                      </span>
                    )}
                  </div>
                </div>
                {editable && entry.kind === 'guest' && (asAdmin || entry.hostMemberId === memberId) && (
                  <MatchActionForm intent="removeGuest" matchId={matchId} entryId={entry.id} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
