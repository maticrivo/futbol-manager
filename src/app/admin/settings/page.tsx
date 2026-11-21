import { getTranslations } from 'next-intl/server'
import AdminNav from '@/components/AdminNav'
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
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 text-start">
      <AdminNav />
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">{t('settings.title')}</h1>

      <Card variant="default" padding="lg">
        <SettingsForm
          capacity={settings.capacity}
          costShekels={(settings.costAgorot / 100).toFixed(2)}
          venue={settings.venue}
          kickoffTime={settings.kickoffTime}
          queueWindowMinutes={settings.queueWindowMinutes}
        />
      </Card>
    </main>
  )
}
