import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { getCurrentMember } from '@/lib/auth'
import DesktopNav from './DesktopNav'
import BottomNav from './BottomNav'

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
      <header className="border-b border-line bg-surface">
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <span className="font-semibold text-ink">{t('common.appName')}</span>
          {children}
        </nav>
      </header>
    )
  }

  const memberInfo = {
    role: member.role,
    status: member.status,
    name: member.name,
  }

  const tKey = (key: string) => t(key)

  return (
    <>
      <DesktopNav member={memberInfo} t={tKey} />
      <BottomNav member={memberInfo} t={tKey} />
      <div className="hidden">{children}</div>
    </>
  )
}
