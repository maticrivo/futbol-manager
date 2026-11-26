import { getLocale, getTranslations } from 'next-intl/server'
import { getDb } from '@/db'
import { getAuditLog } from '@/domain/audit'
import { requireAdmin } from '@/lib/auth'
import { TZ } from '@/lib/time'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'

export default async function AdminAudit() {
  await requireAdmin()
  const db = getDb()

  const [log, locale, t] = await Promise.all([getAuditLog(db), getLocale(), getTranslations('admin')])

  const timeFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium', timeZone: TZ })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">{t('audit.title')}</h1>

      {log.length === 0 ? (
        <EmptyState icon="info" title={t('audit.empty')} />
      ) : (
        <div className="space-y-3">
          {log.map((entry) => (
            <Card key={entry.id} variant="default" padding="md" className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <time dateTime={entry.createdAt.toISOString()}><bdi>{timeFormat.format(entry.createdAt)}</bdi></time>
                <Badge variant="outline">{entry.actorName ? <bdi>{entry.actorName}</bdi> : t('audit.system')}</Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2 font-medium text-sm text-ink">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-muted border border-line"><bdi dir="ltr">{entry.action}</bdi></span>
                <span>
                  <bdi>{entry.entity}</bdi>
                  {entry.entityId && <span className="font-mono text-xs text-muted ms-1" dir="ltr">#{entry.entityId}</span>}
                </span>
              </div>

              {entry.detail != null && (
                <div className="overflow-x-auto rounded-[var(--radius-md)] bg-surface-muted border border-line p-2 text-xs font-mono text-ink">
                  <bdi dir="ltr">{JSON.stringify(entry.detail)}</bdi>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
