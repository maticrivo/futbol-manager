import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { logoutAction } from '@/app/actions/auth'
import { getCurrentMember } from '@/lib/auth'

export default async function Nav({ children }: { children: ReactNode }) {
  const [member, t] = await Promise.all([getCurrentMember(), getTranslations()])

  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <span className="font-semibold">{t('common.appName')}</span>
        {member && (
          <div className="flex flex-wrap items-center gap-3">
            {member.status === 'active' && (
              <>
                <Link href="/">{t('nav.home')}</Link>
                <Link href="/bill">{t('nav.bill')}</Link>
                {member.role === 'admin' && <Link href="/admin">{t('nav.admin')}</Link>}
                <Link href="/profile">{t('nav.profile')}</Link>
              </>
            )}
            <bdi>{member.name}</bdi>
            <form action={logoutAction}>
              <button type="submit" className="cursor-pointer underline">{t('nav.logout')}</button>
            </form>
          </div>
        )}
        {children}
      </nav>
    </header>
  )
}
