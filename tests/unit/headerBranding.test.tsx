import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import Brand from '@/components/Brand'
import MobileHeader from '@/components/MobileHeader'
import { Logo } from '@/components/ui/Logo'

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
