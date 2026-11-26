import { getTranslations } from 'next-intl/server'
import SettingsForm from '@/components/SettingsForm'
import { getDb } from '@/db'
import { getSettings } from '@/domain/matches'
import { requireAdmin } from '@/lib/auth'
import { Card } from '@/components/ui/Card'

export default async function AdminSettings() {
  await requireAdmin()
  const db = getDb()

  const [settings, t] = await Promise.all([getSettings(db), getTranslations('admin')])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">{t('settings.title')}</h1>

      <Card variant="default" padding="lg">
        <SettingsForm
          capacity={settings.capacity}
          costShekels={(settings.costAgorot / 100).toFixed(2)}
          venue={settings.venue}
          venueUrl={settings.venueUrl}
          kickoffTime={settings.kickoffTime}
          queueWindowMinutes={settings.queueWindowMinutes}
          payboxUrl={settings.payboxUrl}
        />
      </Card>
    </div>
  )
}
