import { getLocale, getTranslations } from 'next-intl/server'
import AdminNav from '@/components/AdminNav'
import { getDb } from '@/db'
import { getAuditLog } from '@/domain/audit'
import { requireAdmin } from '@/lib/auth'
import { TZ } from '@/lib/time'

export default async function AdminAudit() {
  await requireAdmin()
  const db = getDb()

  const [log, locale, t] = await Promise.all([getAuditLog(db), getLocale(), getTranslations('admin')])

  const timeFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium', timeZone: TZ })

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 text-start">
      <AdminNav />
      <h1 className="text-2xl font-semibold">{t('audit.title')}</h1>

      {log.length === 0 ? (
        <p className="text-neutral-600 dark:text-neutral-300">{t('audit.empty')}</p>
      ) : (
        <section className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="px-4 py-2 text-start font-medium">{t('audit.time')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('audit.actor')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('audit.action')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('audit.entity')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('audit.detail')}</th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr key={entry.id} className="border-b align-top last:border-b-0">
                  <td className="px-4 py-2 whitespace-nowrap"><bdi>{timeFormat.format(entry.createdAt)}</bdi></td>
                  <td className="px-4 py-2">
                    {entry.actorName ? <bdi>{entry.actorName}</bdi> : t('audit.system')}
                  </td>
                  <td className="px-4 py-2"><bdi dir="ltr">{entry.action}</bdi></td>
                  <td className="px-4 py-2">
                    <bdi>{entry.entity}</bdi>
                    {entry.entityId && <bdi dir="ltr"> #{entry.entityId}</bdi>}
                  </td>
                  <td className="px-4 py-2">
                    <code className="text-xs"><bdi dir="ltr">{entry.detail == null ? '' : JSON.stringify(entry.detail)}</bdi></code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  )
}
