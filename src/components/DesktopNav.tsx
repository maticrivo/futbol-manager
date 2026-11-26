import Brand from './Brand'
import NavLink from './NavLink'
import LocaleSwitcher from './LocaleSwitcher'

export default function DesktopNav({ member, t }: { member: { role: string; status: string; name: string }; t: (key: string) => string }) {
  if (!member || member.status !== 'active') return null
  const isAdmin = member.role === 'admin'

  return (
    <header className="hidden md:block border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex min-w-0 items-center gap-4 md:gap-6">
          <Brand name={t('common.appName')} />
          <nav className="flex items-center gap-1 text-sm font-medium">
            <NavLink href="/" label={t('nav.home')} />
            <NavLink href="/bill" label={t('nav.bill')} />
            {isAdmin && <NavLink href="/admin" label={t('nav.admin')} />}
            <NavLink href="/profile" label={t('nav.profile')} />
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3 md:gap-4">
          <bdi className="max-w-32 truncate text-sm font-medium text-ink">{member.name}</bdi>
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  )
}
