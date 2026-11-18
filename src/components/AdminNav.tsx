import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function AdminNav() {
  const t = await getTranslations('admin')
  return (
    <nav className="flex flex-wrap gap-3 text-sm font-medium">
      <Link href="/admin">{t('nav.dashboard')}</Link>
      <Link href="/admin/members">{t('nav.members')}</Link>
      <Link href="/admin/settings">{t('nav.settings')}</Link>
      <Link href="/admin/audit">{t('nav.audit')}</Link>
    </nav>
  )
}
