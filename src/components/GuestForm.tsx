import { getTranslations } from 'next-intl/server'
import MatchActionForm from './MatchActionForm'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/icons'

export default async function GuestForm({ matchId }: { matchId: number }) {
  const t = await getTranslations('match')
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
        <Icon name="user-plus" size={18} className="text-primary" />
        {t('guests')}
      </h2>
      <MatchActionForm intent="addGuest" matchId={matchId} />
    </Card>
  )
}
