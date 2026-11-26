import NavLink from './NavLink'

export default function BottomNav({ member, t }: { member: { role: string; status: string }; t: (key: string) => string }) {
  if (!member || member.status !== 'active') return null
  const isAdmin = member.role === 'admin'

  return (
    <nav aria-label="Mobile Navigation" className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface/95 border-t border-line flex justify-around items-center h-16 px-2 shadow-lg backdrop-blur">
      <NavLink href="/" label={t('nav.home')} icon="🏠" variant="mobile" />
      <NavLink href="/bill" label={t('nav.bill')} icon="💳" variant="mobile" />
      {isAdmin && <NavLink href="/admin" label={t('nav.admin')} icon="⚙️" variant="mobile" />}
      <NavLink href="/profile" label={t('nav.profile')} icon="👤" variant="mobile" />
    </nav>
  )
}
