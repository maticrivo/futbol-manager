import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getDb } from '@/db'
import { members } from '@/db/schema'
import { requireMember } from '@/lib/auth'
import ProfileForm from '@/components/ProfileForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import LocaleSwitcher from '@/components/LocaleSwitcher'

export default async function ProfilePage() {
  const member = await requireMember()
  const db = getDb()
  const [fresh] = await db
    .select()
    .from(members)
    .where(eq(members.id, member.id))
    .limit(1)

  if (!fresh || fresh.status === 'disabled') {
    redirect('/login/expired')
  }
  if (fresh.status === 'pending') {
    redirect('/login/pending')
  }

  const t = await getTranslations('profile')

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 pb-28 md:pb-8 text-start">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <Card className="space-y-6 p-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-ink">{t('language')}</label>
          <LocaleSwitcher />
        </div>
        <div className="border-t border-line pt-4">
          <ProfileForm member={fresh} />
        </div>
      </Card>
    </main>
  )
}
