import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { Button } from '@/components/ui/Button'

export default async function ExpiredLoginPage() {
  const t = await getTranslations('auth')

  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-4 py-12 text-start">
      <PageHeader title={t('sessionExpiredTitle')} />
      <Card className="space-y-6 p-6">
        <InlineMessage variant="danger" title={t('sessionExpiredTitle')}>
          {t('sessionExpiredDescription')}
        </InlineMessage>
        <Button href="/login" variant="primary" className="w-full">
          {t('signInAgain')}
        </Button>
      </Card>
    </main>
  )
}
