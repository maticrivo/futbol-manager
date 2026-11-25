'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/Button'

export type OAuthProviderButton = 'google' | 'facebook'

function ProviderIcon({ provider }: { provider: OAuthProviderButton }) {
  if (provider === 'google') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" />
        <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.2v2.6A10 10 0 0 0 12 22Z" />
        <path fill="#FBBC05" d="M6.5 13.9a6 6 0 0 1 0-3.8V7.5H3.2a10 10 0 0 0 0 9l3.3-2.6Z" />
        <path fill="#EA4335" d="M12 6c1.5 0 2.9.5 3.9 1.5l2.9-2.9A10 10 0 0 0 3.2 7.5l3.3 2.6A5.9 5.9 0 0 1 12 6Z" />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.3l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12Z"
      />
    </svg>
  )
}

export default function ProviderButton({
  provider,
  label,
}: {
  provider: OAuthProviderButton
  label: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      variant="outline"
      className="w-full"
      isLoading={pending}
      leftIcon={<ProviderIcon provider={provider} />}
    >
      {label}
    </Button>
  )
}
