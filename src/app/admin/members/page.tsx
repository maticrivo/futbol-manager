import { getLocale, getTranslations } from 'next-intl/server'
import AddMemberByEmailForm from '@/components/AddMemberByEmailForm'
import AdminNav from '@/components/AdminNav'
import MemberActions from '@/components/MemberActions'
import MemberEditForm from '@/components/MemberEditForm'
import LinkMemberForm from '@/components/LinkMemberForm'
import { getDb } from '@/db'
import { listMembers } from '@/domain/members'
import { requireAdmin } from '@/lib/auth'
import { TZ } from '@/lib/time'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export default async function AdminMembers() {
  const admin = await requireAdmin()
  const db = getDb()

  const [members, locale, t] = await Promise.all([
    listMembers(db),
    getLocale(),
    getTranslations('admin'),
  ])

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: TZ })
  const activeTargets = members
    .filter((member) => member.status === 'active')
    .map((member) => ({ id: member.id, name: member.name }))

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 text-start">
      <AdminNav />
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">{t('members.title')}</h1>

      <AddMemberByEmailForm />

      <section className="space-y-4">
        {members.map((member) => (
          <Card key={member.id} variant="default" padding="md" className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-lg text-ink"><bdi>{member.name}</bdi></span>
                  {member.role === 'admin' ? (
                    <Badge variant="primary" size="sm">{t('members.roleAdmin')}</Badge>
                  ) : (
                    <Badge variant="secondary" size="sm">{t('members.roleMember')}</Badge>
                  )}
                  {member.status === 'pending' ? (
                    <Badge variant="warning" size="sm">{t('members.statusPending')}</Badge>
                  ) : member.status === 'active' ? (
                    <Badge variant="success" size="sm">{t('members.statusActive')}</Badge>
                  ) : (
                    <Badge variant="secondary" size="sm">{t('members.statusDisabled')}</Badge>
                  )}
                </div>
                {member.nickname ? (
                  <div className="text-xs text-muted">
                    <bdi>{member.nickname}</bdi>
                  </div>
                ) : null}
              </div>
              <div className="text-xs text-muted sm:text-right space-y-0.5">
                <div>Locale: <bdi dir="ltr">{member.locale}</bdi></div>
                <div>Joined: <bdi>{dateFormat.format(member.createdAt)}</bdi></div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted pt-1 border-t border-line">
              <div>
                <span className="font-medium text-ink">{t('members.email')}: </span>
                {member.email ? <bdi dir="ltr">{member.email}</bdi> : '—'}
              </div>
              <div>
                <span className="font-medium text-ink">{t('members.phone')}: </span>
                {member.phone ? <bdi dir="ltr">{member.phone}</bdi> : '—'}
              </div>
            </div>

            <div className="pt-2 border-t border-line space-y-3">
              <MemberActions memberId={member.id} isSelf={member.id === admin.id} status={member.status} />
              {member.status === 'pending' && (
                activeTargets.some((target) => target.id !== member.id) ? (
                  <LinkMemberForm
                    pendingId={member.id}
                    targets={activeTargets.filter((target) => target.id !== member.id)}
                  />
                ) : null
              )}
              <details className="text-xs group">
                <summary className="cursor-pointer font-medium text-primary hover:underline">
                  {t('members.editDetails')}
                </summary>
                <div className="mt-3 rounded-lg border border-line bg-surface-muted p-4">
                  <MemberEditForm member={member} />
                </div>
              </details>
            </div>
          </Card>
        ))}
      </section>
    </main>
  )
}
