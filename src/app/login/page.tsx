import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import LoginForm from '@/components/LoginForm'
import { getCurrentMember } from '@/lib/auth'

export default async function LoginPage() {
  const member = await getCurrentMember()
  if (member) {
    if (member.status === 'pending') {
      redirect('/login/pending')
    }
    redirect('/')
  }

  const t = await getTranslations('auth')

  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-4 py-12 text-start">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t('signInTitle')}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('signInSubtitle')}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950">
        <LoginForm />
      </div>
    </main>
  )
}
