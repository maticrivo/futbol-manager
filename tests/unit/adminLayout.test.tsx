import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import AdminLayout from '@/app/admin/layout'
import Loading from '@/app/loading'
import AdminLoading from '@/app/admin/loading'

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => key
    t.has = () => true
    return t
  },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/members',
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/auth', () => ({
  requireAdmin: vi.fn(async () => ({ id: 'admin', role: 'admin', status: 'active', name: 'Admin' })),
}))

it('keeps the admin tabs around the page content', async () => {
  const html = renderToStaticMarkup(
    await AdminLayout({ children: <p>page body</p> }),
  )

  expect(html).toContain('href="/admin/members"')
  expect(html).toContain('<p>page body</p>')
  expect(html.indexOf('href="/admin/members"')).toBeLessThan(html.indexOf('<p>page body</p>'))
})

it('shows the shared football loader while an admin page loads', () => {
  expect(AdminLoading).toBe(Loading)
})
