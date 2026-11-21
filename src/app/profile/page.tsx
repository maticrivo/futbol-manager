import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getDb } from '@/db'
import { members } from '@/db/schema'
import { requireMember } from '@/lib/auth'
import ProfileForm from '@/components/ProfileForm'

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
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-8 text-start">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('subtitle')}</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950">
        <ProfileForm member={fresh} />
      </div>
    </main>
  )
}
