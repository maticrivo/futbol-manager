import { OAUTH_PROVIDERS, type OAuthProvider } from '@/domain/oauth'

export function isOAuthProviderConfigured(provider: OAuthProvider): boolean {
  if (provider === 'google') {
    return Boolean(process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim())
  }

  return Boolean(process.env.AUTH_FACEBOOK_ID?.trim() && process.env.AUTH_FACEBOOK_SECRET?.trim())
}

export function configuredOAuthProviders(): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter(isOAuthProviderConfigured)
}
