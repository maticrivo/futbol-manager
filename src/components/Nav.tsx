import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { getCurrentMember } from '@/lib/auth'
import Brand from './Brand'
import DesktopNav from './DesktopNav'
import BottomNav from './BottomNav'
import MobileHeader from './MobileHeader'

export default async function Nav({ children }: { children: ReactNode }) {
  const member = await getCurrentMember()
  const t = await getTranslations()

  if (!member || member.status !== 'active') {
    return (
      <header className="border-b border-line bg-surface">
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <Brand name={t('common.appName')} />
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
      <MobileHeader name={t('common.appName')} />
      <DesktopNav member={memberInfo} t={tKey} />
      <BottomNav member={memberInfo} t={tKey} />
      <div className="hidden">{children}</div>
    </>
  )
}
