import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'

export default async function NotFound() {
  const t = await getTranslations()

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-12 text-center">
      <EmptyState
        icon="info"
        title={t('errors.NOT_FOUND') ?? 'Page not found'}
        description={t('errors.NOT_FOUND_DESC') ?? 'The page you are looking for does not exist or has been moved.'}
        action={
          <Button asChild variant="primary">
            <Link href="/">{t('match.back') ?? 'Back to Home'}</Link>
          </Button>
        }
        className="w-full"
      />
    </main>
  )
}
