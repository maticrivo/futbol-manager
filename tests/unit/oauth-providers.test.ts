import { afterEach, describe, expect, it, vi } from 'vitest'
import { configuredOAuthProviders, isOAuthProviderConfigured } from '@/lib/oauth-providers'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('configuredOAuthProviders', () => {
  it('requires both the id and secret for each provider', () => {
    vi.stubEnv('AUTH_GOOGLE_ID', 'google-id')
    vi.stubEnv('AUTH_GOOGLE_SECRET', '')
    vi.stubEnv('AUTH_FACEBOOK_ID', 'facebook-id')
    vi.stubEnv('AUTH_FACEBOOK_SECRET', 'facebook-secret')

    expect(isOAuthProviderConfigured('google')).toBe(false)
    expect(isOAuthProviderConfigured('facebook')).toBe(true)
    expect(configuredOAuthProviders()).toEqual(['facebook'])
  })

  it('returns an empty list when neither provider is configured', () => {
    vi.stubEnv('AUTH_GOOGLE_ID', '')
    vi.stubEnv('AUTH_GOOGLE_SECRET', '')
    vi.stubEnv('AUTH_FACEBOOK_ID', '')
    vi.stubEnv('AUTH_FACEBOOK_SECRET', '')

    expect(configuredOAuthProviders()).toEqual([])
  })

  it('returns both providers when both are configured', () => {
    vi.stubEnv('AUTH_GOOGLE_ID', 'google-id')
    vi.stubEnv('AUTH_GOOGLE_SECRET', 'google-secret')
    vi.stubEnv('AUTH_FACEBOOK_ID', 'facebook-id')
    vi.stubEnv('AUTH_FACEBOOK_SECRET', 'facebook-secret')

    expect(configuredOAuthProviders()).toEqual(['google', 'facebook'])
  })
})
