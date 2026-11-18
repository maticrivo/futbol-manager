import { getTranslations } from 'next-intl/server'
import { requireMember } from '@/lib/auth'

export default async function Home() {
  const member = await requireMember()
  const t = await getTranslations()

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <section className="space-y-2 rounded border p-4">
        <h1 className="text-xl font-semibold">
          {t('auth.signedInAs', { name: member.name })}
          {member.role === 'admin' && ` (${t('nav.admin')})`}
        </h1>
        <p>{t('home.placeholder')}</p>
      </section>
    </main>
  )
}
