import { getTranslations } from 'next-intl/server'

export default async function ExpiredLoginPage() {
  const t = await getTranslations('auth')
  return (
    <main className="mx-auto w-full max-w-3xl space-y-2 px-4 py-8 text-start">
      <h1 className="text-xl font-semibold">{t('invalidLink')}</h1>
      <p>{t('askAdmin')}</p>
    </main>
  )
}
