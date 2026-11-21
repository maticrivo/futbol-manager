import Link from 'next/link'
import LocaleSwitcher from './LocaleSwitcher'

export default function DesktopNav({ member, t }: { member: { role: string; status: string; name: string }; t: (key: string) => string }) {
  if (!member || member.status !== 'active') return null
  const isAdmin = member.role === 'admin'

  return (
    <header className="hidden md:block border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-lg text-ink">{t('common.appName')}</span>
          <nav className="flex items-center gap-4 text-sm font-medium text-muted">
            <Link href="/" className="hover:text-ink transition-colors">{t('nav.home')}</Link>
            <Link href="/bill" className="hover:text-ink transition-colors">{t('nav.bill')}</Link>
            {isAdmin && <Link href="/admin" className="hover:text-ink transition-colors">{t('nav.admin')}</Link>}
            <Link href="/profile" className="hover:text-ink transition-colors">{t('nav.profile')}</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <bdi className="text-sm font-medium text-ink">{member.name}</bdi>
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  )
}
