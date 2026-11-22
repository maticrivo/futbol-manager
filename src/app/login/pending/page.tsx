import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { logoutAction } from '@/app/actions/auth'
import { getCurrentMember } from '@/lib/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { InlineMessage } from '@/components/ui/InlineMessage'

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
    <main className="mx-auto w-full max-w-md space-y-6 px-4 py-12 text-start">
      <PageHeader title={t('pendingTitle')} />
      <Card className="space-y-6 p-6">
        <InlineMessage variant="warning" title={t('pendingTitle')}>
          {t('pendingDescription')}
        </InlineMessage>
        <p className="text-sm text-muted">
          {t('signedInAs', { name: member.name })}
        </p>
        <Button href="/profile" variant="primary" className="w-full">
          {t('completeProfile')}
        </Button>
        <form action={logoutAction}>
          <Button type="submit" variant="outline" className="w-full">
            {t('signOut')}
          </Button>
        </form>
      </Card>
    </main>
  )
}
