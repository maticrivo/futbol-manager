'use client'

import { useTranslations } from 'next-intl'
import { signInWithProviderAction } from '@/app/actions/auth'
import type { OAuthProvider } from '@/domain/oauth'
import ProviderButton from './ProviderButton'
import { Badge } from './ui/Badge'

const PROVIDERS: OAuthProvider[] = ['google', 'facebook']

export default function ConnectedAccounts({
  linked,
  available,
}: {
  linked: OAuthProvider[]
  available: OAuthProvider[]
}) {
  const t = useTranslations('profile.connectedAccounts')
  const providers = PROVIDERS.filter((provider) => available.includes(provider))

  if (providers.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">{t('title')}</h2>
      {providers.map((provider) => {
        const connected = linked.includes(provider)
        return (
          <div key={provider} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-ink">{t(provider)}</span>
            {connected ? (
              <Badge variant="success" size="sm">{t('connected')}</Badge>
            ) : (
              <form action={signInWithProviderAction} className="w-full sm:w-auto">
                <input type="hidden" name="provider" value={provider} />
                <input type="hidden" name="redirectTo" value="/profile" />
                <ProviderButton
                  provider={provider}
                  label={t('connectProvider', { provider: t(provider) })}
                />
              </form>
            )}
          </div>
        )
      })}
    </div>
  )
}
