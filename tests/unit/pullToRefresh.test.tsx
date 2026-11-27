import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { PullIndicator } from '@/components/PullToRefresh'

const messages = JSON.parse(
  readFileSync(new URL('../../messages/he.json', import.meta.url), 'utf8'),
) as { common: { refreshing: string } }

it('renders an accessible mobile-only refresh indicator', () => {
  const html = renderToStaticMarkup(
    <PullIndicator distance={80} refreshing label={messages.common.refreshing} />,
  )

  expect(html).toContain('role="status"')
  expect(html).toContain('aria-live="polite"')
  expect(html).toContain('md:hidden')
  expect(html).toContain('aria-hidden="true"')
  const svg = html.match(/<svg[^>]*>/)?.[0] ?? ''
  expect(svg).toContain('football-spin')
  expect(svg).toContain('aria-hidden="true"')
  expect(html).toContain(messages.common.refreshing)
  expect(messages.common.refreshing).toBe('מרענן…')
})

it('keeps the label out of the markup at rest', () => {
  const html = renderToStaticMarkup(
    <PullIndicator distance={0} refreshing={false} label={messages.common.refreshing} />,
  )

  expect(html).not.toContain(messages.common.refreshing)
  expect(html).toContain('role="status"')
})
