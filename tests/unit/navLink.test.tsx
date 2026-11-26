import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import NavLink from '@/components/NavLink'

const pathname = vi.hoisted(() => ({ current: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }))

it('marks the home desktop link active on a match page', () => {
  pathname.current = '/match/123'
  const html = renderToStaticMarkup(<NavLink href="/" label="Home" />)
  expect(html).toContain('aria-current="page"')
  expect(html).toContain('bg-primary-soft')
  expect(html).toContain('text-primary')
})

it('leaves other desktop links inactive', () => {
  pathname.current = '/bill'
  const html = renderToStaticMarkup(<NavLink href="/" label="Home" />)
  expect(html).not.toContain('aria-current')
  expect(html).not.toContain('bg-primary-soft')
  expect(html).toContain('text-muted')
})

it('marks admin active throughout the admin area', () => {
  pathname.current = '/admin/members'
  const html = renderToStaticMarkup(<NavLink href="/admin" label="Admin" />)
  expect(html).toContain('aria-current="page"')
})

it('marks the active mobile tab with a pill around the icon', () => {
  pathname.current = '/profile'
  const html = renderToStaticMarkup(
    <NavLink href="/profile" label="Profile" icon="👤" variant="mobile" />,
  )
  expect(html).toContain('aria-current="page"')
  expect(html).toContain('bg-primary-soft')
  expect(html).toContain('text-primary')
  expect(html).toContain('👤')
})

it('leaves other mobile tabs inactive', () => {
  pathname.current = '/profile'
  const html = renderToStaticMarkup(
    <NavLink href="/" label="Home" icon="🏠" variant="mobile" />,
  )
  expect(html).not.toContain('aria-current')
  expect(html).not.toContain('bg-primary-soft')
  expect(html).toContain('text-muted')
})
