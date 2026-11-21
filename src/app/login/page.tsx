import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import LoginForm from '@/components/LoginForm'
import { getCurrentMember } from '@/lib/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import LocaleSwitcher from '@/components/LocaleSwitcher'

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
      <PageHeader
        title={t('signInTitle')}
        subtitle={t('signInSubtitle')}
        className="text-center sm:text-center justify-center"
      />

      <Card className="space-y-6 p-6">
        <div className="flex justify-center pb-2 border-b border-line">
          <LocaleSwitcher />
        </div>
        <LoginForm />
      </Card>
    </main>
  )
}
