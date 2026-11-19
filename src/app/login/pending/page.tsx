import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { logoutAction } from '@/app/actions/auth'
import { getCurrentMember } from '@/lib/auth'

export default async function PendingPage() {
  const member = await getCurrentMember()
  if (!member) {
    redirect('/login')
  }
  if (member.status === 'active') {
    redirect('/')
  }

  const t = await getTranslations('auth')

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 text-start">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-950/20">
        <h1 className="text-xl font-semibold text-amber-900 dark:text-amber-200">
          {t('pendingTitle')}
        </h1>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
          {t('pendingDescription')}
        </p>
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          {t('signedInAs', { name: member.name })}
        </p>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          {t('signOut')}
        </button>
      </form>
    </main>
  )
}
