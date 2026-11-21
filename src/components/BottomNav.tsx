import Link from 'next/link'

export default async function BottomNav({ member, t }: { member: { role: string; status: string }; t: (key: string) => string }) {
  if (!member || member.status !== 'active') return null
  const isAdmin = member.role === 'admin'

  return (
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
  )
}
