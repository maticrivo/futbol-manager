import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { headers } from 'next/headers'

export default async function AdminNav() {
  const t = await getTranslations('admin')
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || headersList.get('referer') ? new URL(headersList.get('referer') || 'http://localhost').pathname : '/admin'

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin' || pathname === '/admin/'
    }
    return pathname.startsWith(href)
  }

  return (
    <nav className="flex flex-wrap gap-2 text-sm font-medium border-b pb-3 mb-6">
      <Link href="/admin" className={`px-3 py-1.5 rounded-full transition-colors ${isActive('/admin') && pathname === '/admin' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{t('nav.dashboard')}</Link>
      <Link href="/admin/members" className={`px-3 py-1.5 rounded-full transition-colors ${isActive('/admin/members') ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{t('nav.members')}</Link>
      <Link href="/admin/money" className={`px-3 py-1.5 rounded-full transition-colors ${isActive('/admin/money') ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{t('nav.money')}</Link>
      <Link href="/admin/settings" className={`px-3 py-1.5 rounded-full transition-colors ${isActive('/admin/settings') ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{t('nav.settings')}</Link>
      <Link href="/admin/audit" className={`px-3 py-1.5 rounded-full transition-colors ${isActive('/admin/audit') ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{t('nav.audit')}</Link>
    </nav>
  )
}

