import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import Brand from '@/components/Brand'
import DesktopNav from '@/components/DesktopNav'
import MobileHeader from '@/components/MobileHeader'
import { Logo } from '@/components/ui/Logo'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/app/actions/auth', () => ({
  setLocaleAction: vi.fn(),
}))

it('renders the app icon at the requested size', () => {
  const html = renderToStaticMarkup(<Logo size={32} />)
  expect(html).toContain('src="/app-icon.svg"')
  expect(html).toContain('width="32"')
  expect(html).toContain('height="32"')
})

it('renders the logo beside the app name', () => {
  const html = renderToStaticMarkup(<Brand name="Tuesday Football" />)
  expect(html).toContain('src="/app-icon.svg"')
  expect(html).toContain('Tuesday Football')
})

it('renders a mobile-only header', () => {
  const html = renderToStaticMarkup(<MobileHeader name="Tuesday Football" />)
  expect(html).toContain('md:hidden')
  expect(html).toContain('src="/app-icon.svg"')
  expect(html).toContain('Tuesday Football')
})

it('renders a desktop-only header that can shed width at the md breakpoint', () => {
  const html = renderToStaticMarkup(
    <DesktopNav
      member={{ role: 'admin', status: 'active', name: 'A Very Long Member Name' }}
      t={(key) => key}
    />,
  )
  expect(html).toContain('hidden md:block')
  expect(html).toContain('md:gap-6')
  expect(html).toContain('shrink-0')
  expect(html).toContain('truncate')
  expect(html).toContain('px-2.5')
  expect(html).toContain('lg:px-3')
})
