import NextAuth from 'next-auth'
import Facebook from 'next-auth/providers/facebook'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { getDb } from '@/db'
import { accounts, sessions, users } from '@/db/schema'
import {
  authorizeOAuthSignIn,
  normalizeOAuthIdentity,
  onCreateOAuthUser,
  onLinkOAuthAccount,
  onOAuthSignIn,
} from '@/domain/oauth'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
  }),
  session: {
    strategy: 'database',
    maxAge: 365 * 24 * 60 * 60,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    Google({ allowDangerousEmailAccountLinking: true }),
    Facebook({ allowDangerousEmailAccountLinking: true }),
  ],
  callbacks: {
    async signIn({ user }) {
      const identity = normalizeOAuthIdentity(user)
      if (!identity) return '/login?error=email-missing'
      user.name = identity.name
      user.email = identity.email
      return authorizeOAuthSignIn(getDb(), { id: user.id, email: identity.email })
    },
  },
  events: {
    async createUser({ user }) {
      if (user.id) await onCreateOAuthUser(getDb(), { id: user.id, email: user.email })
    },
    async signIn({ user, account }) {
      await onOAuthSignIn(getDb(), { id: user.id ?? undefined, provider: account?.provider })
    },
    async linkAccount({ user, account }) {
      if (user.id) await onLinkOAuthAccount(getDb(), { userId: user.id, provider: account.provider })
    },
  },
})
