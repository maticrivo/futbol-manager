import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import SocialLoginButtons from '@/components/SocialLoginButtons'
import { getCurrentMember } from '@/lib/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { InlineMessage } from '@/components/ui/InlineMessage'
import LocaleSwitcher from '@/components/LocaleSwitcher'

type LoginPageProps = {
  searchParams?: Promise<{ error?: string }>
}

function authErrorMessage(error: string | undefined): 'emailMissing' | 'accessDenied' | 'signInError' | null {
  if (!error) return null
  if (error === 'email-missing') return 'emailMissing'
  if (error === 'AccessDenied') return 'accessDenied'
  return 'signInError'
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {}
  const member = await getCurrentMember()
  if (member && !params.error) {
    if (member.status === 'pending') {
      redirect('/login/pending')
    }
    redirect('/')
  }

  const t = await getTranslations('auth')
  const errorKey = authErrorMessage(params.error)

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

        {errorKey && (
          <InlineMessage variant="danger" title={t(errorKey)} />
        )}

        {member ? (
          <Button href="/profile" variant="primary" className="w-full">
            {t('backToProfile')}
          </Button>
        ) : (
          <SocialLoginButtons />
        )}
      </Card>
    </main>
  )
}
