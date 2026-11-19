import { getLocale, getTranslations } from 'next-intl/server'
import AddMemberByEmailForm from '@/components/AddMemberByEmailForm'
import AdminNav from '@/components/AdminNav'
import MemberActions from '@/components/MemberActions'
import { getDb } from '@/db'
import { listMembers } from '@/domain/members'
import { requireAdmin } from '@/lib/auth'
import { TZ } from '@/lib/time'

export default async function AdminMembers() {
  const admin = await requireAdmin()
  const db = getDb()

  const [members, locale, t] = await Promise.all([
    listMembers(db),
    getLocale(),
    getTranslations('admin'),
  ])

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: TZ })

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 text-start">
      <AdminNav />
      <h1 className="text-2xl font-semibold">{t('members.title')}</h1>

      <AddMemberByEmailForm />

      <section className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b text-start">
            <tr>
              <th className="px-4 py-2 text-start font-medium">{t('members.name')}</th>
              <th className="px-4 py-2 text-start font-medium">{t('members.role')}</th>
              <th className="px-4 py-2 text-start font-medium">{t('members.status')}</th>
              <th className="px-4 py-2 text-start font-medium">{t('members.locale')}</th>
              <th className="px-4 py-2 text-start font-medium">{t('members.created')}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b last:border-b-0">
                <td className="px-4 py-2 align-top"><bdi>{member.name}</bdi></td>
                <td className="px-4 py-2 align-top">
                  {member.role === 'admin' ? t('members.roleAdmin') : t('members.roleMember')}
                </td>
                <td className="px-4 py-2 align-top">
                  {member.status === 'pending' ? (
                    <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
                      {t('members.statusPending')}
                    </span>
                  ) : member.status === 'active' ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                      {t('members.statusActive')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-neutral-300 bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                      {t('members.statusDisabled')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 align-top"><bdi dir="ltr">{member.locale}</bdi></td>
                <td className="px-4 py-2 align-top"><bdi>{dateFormat.format(member.createdAt)}</bdi></td>
                <td className="px-4 py-2 align-top">
                  <MemberActions memberId={member.id} isSelf={member.id === admin.id} status={member.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
