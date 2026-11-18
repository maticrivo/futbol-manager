import { getTranslations } from 'next-intl/server'
import AdminNav from '@/components/AdminNav'
import SettingsForm from '@/components/SettingsForm'
import { getDb } from '@/db'
import { getSettings } from '@/domain/matches'
import { requireAdmin } from '@/lib/auth'

export default async function AdminSettings() {
  await requireAdmin()
  const db = getDb()

  const [settings, t] = await Promise.all([getSettings(db), getTranslations('admin')])

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 text-start">
      <AdminNav />
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>

      <section className="rounded-xl border p-5">
        <SettingsForm
          capacity={settings.capacity}
          costShekels={(settings.costAgorot / 100).toFixed(2)}
          venue={settings.venue}
          kickoffTime={settings.kickoffTime}
          queueWindowMinutes={settings.queueWindowMinutes}
        />
      </section>
    </main>
  )
}
