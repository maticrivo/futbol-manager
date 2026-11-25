import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { getDb } from '@/db'
import { requireSessionMember } from '@/lib/auth'
import ProfileForm from '@/components/ProfileForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { Button } from '@/components/ui/Button'
import { logoutAction } from '@/app/actions/auth'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import ThemeSwitcher from '@/components/ThemeSwitcher'
import NotificationPrefs from '@/components/NotificationPrefs'
import PushSetup from '@/components/PushSetup'
import { listNotificationPrefs, NOTIFICATION_CATEGORIES } from '@/domain/notifications'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'

export default async function ProfilePage() {
  const member = await requireSessionMember()
  const db = getDb()
  if (member.status === 'disabled') {
    redirect('/login/expired')
  }

  const [t, ta, prefs] = await Promise.all([
    getTranslations('profile'),
    getTranslations('auth'),
    listNotificationPrefs(db, member.id),
  ])
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 pb-28 md:pb-8 text-start">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {member.status === 'pending' && (
        <InlineMessage variant="warning" title={ta('pendingTitle')}>
          {ta('pendingDescription')}
        </InlineMessage>
      )}

      <Card className="space-y-6 p-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-ink">{t('language')}</label>
          <LocaleSwitcher />
        </div>
        <div className="border-t border-line pt-4 space-y-2">
          <label className="text-sm font-medium text-ink">{t('theme')}</label>
          <ThemeSwitcher currentTheme={theme} />
          <p className="text-xs text-muted">{t('themeHint')}</p>
        </div>
        <div className="border-t border-line pt-4">
          <ProfileForm member={member} />
        </div>
      </Card>

      <NotificationPrefs categories={NOTIFICATION_CATEGORIES} prefs={prefs} />
      <PushSetup />

      <form action={logoutAction} className="text-center">
        <Button type="submit" variant="ghost">
          {ta('signOut')}
        </Button>
      </form>
    </main>
  )
}
