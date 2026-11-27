import { getTranslations } from 'next-intl/server'
import type { BagDutyView, BagPerson } from '@/domain/matchView'
import { Card } from '@/components/ui/Card'
import { MemberName } from '@/components/ui/MemberName'

function nameTag(person: BagPerson) {
  return function NameTag() {
    return <MemberName name={person.name} nickname={person.nickname} />
  }
}

export default async function BagDutyPanel({ duty }: { duty: BagDutyView }) {
  const t = await getTranslations('match')
  const taker = duty.actual ?? duty.assigned

  return (
    <Card className="space-y-2">
      <h2 className="text-lg font-semibold text-ink">{t('bag.title')}</h2>
      <p className="text-sm text-ink">
        {duty.actual
          ? t.rich('bag.actual', { name: nameTag(taker) })
          : t.rich('bag.assigned', { name: nameTag(taker) })}
      </p>
      <p className="text-sm text-muted">
        {duty.backup ? t.rich('bag.backup', { name: nameTag(duty.backup) }) : t('bag.noBackup')}
      </p>
    </Card>
  )
}
