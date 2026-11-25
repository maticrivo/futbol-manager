'use client'

import { useTranslations } from 'next-intl'
import { signInWithProviderAction } from '@/app/actions/auth'
import ProviderButton from './ProviderButton'

const PROVIDERS = [
  { id: 'google', labelKey: 'continueWithGoogle' },
  { id: 'facebook', labelKey: 'continueWithFacebook' },
] as const

export default function SocialLoginButtons() {
  const t = useTranslations('auth')

  return (
    <div className="space-y-3">
      {PROVIDERS.map((provider) => (
        <form key={provider.id} action={signInWithProviderAction}>
          <input type="hidden" name="provider" value={provider.id} />
          <input type="hidden" name="redirectTo" value="/" />
          <ProviderButton provider={provider.id} label={t(provider.labelKey)} />
        </form>
      ))}
    </div>
  )
}
