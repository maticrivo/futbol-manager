import { getLocale, getTranslations } from 'next-intl/server'
import AddMemberForm from '@/components/AddMemberForm'
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

      <AddMemberForm />

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
                  {member.status === 'active' ? t('members.statusActive') : t('members.statusDisabled')}
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
