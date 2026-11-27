import { getTranslations } from 'next-intl/server'
import type { MatchResponses, ResponseMember } from '@/domain/responses'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { MemberName } from '@/components/ui/MemberName'

function MemberList({ members, empty }: { members: ResponseMember[]; empty: string }) {
  if (members.length === 0) return <p className="text-sm text-muted py-1">{empty}</p>
  return (
    <ul className="flex flex-wrap gap-2">
      {members.map(member => (
        <li key={member.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-surface-muted py-1 ps-1 pe-3 text-sm text-ink">
          <Avatar name={member.nickname?.trim() || member.name} src={member.image} size="sm" aria-hidden="true" />
          <MemberName name={member.name} nickname={member.nickname} />
        </li>
      ))}
    </ul>
  )
}

/**
 * Renders whichever response lists it is given; who may see them is decided by `listMatchResponses`.
 * Like the waiting-list card, it stays visible with an empty state while answers are open
 * (`showEmpty`) and otherwise appears only when there is someone to list.
 */
export default async function ResponsesPanel({
  notGoing, unanswered, showEmpty,
}: MatchResponses & { showEmpty: boolean }) {
  if (notGoing.length === 0 && unanswered === null && !showEmpty) return null
  const t = await getTranslations('responses')

  const sections = [
    { key: 'notGoing', title: t('notGoing'), empty: t('notGoingEmpty'), members: notGoing },
    ...(unanswered === null ? [] : [{ key: 'unanswered', title: t('unanswered'), empty: t('unansweredEmpty'), members: unanswered }]),
  ]

  return (
    <Card className="space-y-4">
      {sections.map(section => (
        <section key={section.key} className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">{section.title}</h2>
            <Badge variant="secondary" size="sm">{section.members.length}</Badge>
          </div>
          <MemberList members={section.members} empty={section.empty} />
        </section>
      ))}
    </Card>
  )
}
