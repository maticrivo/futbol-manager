import { getTranslations } from 'next-intl/server'
import MatchActionForm from './MatchActionForm'

export default async function GuestForm({ matchId }: { matchId: number }) {
  const t = await getTranslations('match')
  return (
    <section className="space-y-2 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">{t('guests')}</h2>
      <MatchActionForm intent="addGuest" matchId={matchId} />
    </section>
  )
}
