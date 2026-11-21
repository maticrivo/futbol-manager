'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

export default function AdminNav() {
  const t = useTranslations('admin')
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin' || pathname === '/admin/'
    }
    return pathname.startsWith(href)
  }

  const linkClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full transition-colors ${
      active
        ? 'bg-primary text-on-primary shadow-sm'
        : 'bg-surface-muted text-ink hover:bg-line'
    }`

  return (
    <nav className="flex flex-wrap gap-2 text-sm font-medium border-b border-line pb-3 mb-6">
      <Link href="/admin" className={linkClass(isActive('/admin'))}>
        {t('nav.dashboard')}
      </Link>
      <Link href="/admin/members" className={linkClass(isActive('/admin/members'))}>
        {t('nav.members')}
      </Link>
      <Link href="/admin/money" className={linkClass(isActive('/admin/money'))}>
        {t('nav.money')}
      </Link>
      <Link href="/admin/settings" className={linkClass(isActive('/admin/settings'))}>
        {t('nav.settings')}
      </Link>
      <Link href="/admin/audit" className={linkClass(isActive('/admin/audit'))}>
        {t('nav.audit')}
      </Link>
    </nav>
  )
}
