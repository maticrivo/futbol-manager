import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { getCurrentMember } from '@/lib/auth'

export function isAdminTabActive(pathname: string): boolean {
  return pathname.startsWith('/admin')
}

export function isPrimaryNavActive(href: string, pathname: string): boolean {
  if (href === '/') {
    return pathname === '/' || pathname.startsWith('/match')
  }
  return pathname.startsWith(href)
}

export default async function Nav({ children }: { children: ReactNode }) {
  const member = await getCurrentMember()
  const t = await getTranslations()

  if (!member || member.status !== 'active') {
    return (
      <header className="border-b">
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <span className="font-semibold">{t('common.appName')}</span>
          {children}
        </nav>
      </header>
    )
  }

  const isAdmin = member.role === 'admin'

  return (
    <>
      <header className="hidden md:block border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-lg">{t('common.appName')}</span>
            <nav className="flex items-center gap-4 text-sm font-medium">
              <Link href="/">{t('nav.home')}</Link>
              <Link href="/bill">{t('nav.bill')}</Link>
              {isAdmin && <Link href="/admin">{t('nav.admin')}</Link>}
              <Link href="/profile">{t('nav.profile')}</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <bdi className="text-sm text-gray-700">{member.name}</bdi>
          </div>
        </div>
      </header>
      <nav aria-label="Mobile Navigation" className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 flex justify-around items-center h-16 px-2 shadow-lg">
        <Link href="/" className="flex flex-col items-center justify-center flex-1 py-1 text-xs font-medium text-gray-600">
          <span>🏠</span>
          <span>{t('nav.home')}</span>
        </Link>
        <Link href="/bill" className="flex flex-col items-center justify-center flex-1 py-1 text-xs font-medium text-gray-600">
          <span>💳</span>
          <span>{t('nav.bill')}</span>
        </Link>
        {isAdmin && (
          <Link href="/admin" className="flex flex-col items-center justify-center flex-1 py-1 text-xs font-medium text-gray-600">
            <span>⚙️</span>
            <span>{t('nav.admin')}</span>
          </Link>
        )}
        <Link href="/profile" className="flex flex-col items-center justify-center flex-1 py-1 text-xs font-medium text-gray-600">
          <span>👤</span>
          <span>{t('nav.profile')}</span>
        </Link>
      </nav>
      <div className="hidden">{children}</div>
    </>
  )
}
