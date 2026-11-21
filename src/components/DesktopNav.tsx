import Link from 'next/link'
import LocaleSwitcher from './LocaleSwitcher'

export default async function DesktopNav({ member, t }: { member: { role: string; status: string; name: string }; t: (key: string) => string }) {
  if (!member || member.status !== 'active') return null
  const isAdmin = member.role === 'admin'

  return (
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
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  )
}
