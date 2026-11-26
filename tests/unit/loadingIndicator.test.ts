import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { expect, it } from 'vitest'
import Loading from '@/app/loading'

function render(locale: string, label: string) {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      {
        locale,
        messages: { common: { loading: label } },
        children: createElement(Loading),
      },
    ),
  )
}

it('renders a status with the localized loading label and the football', () => {
  const html = render('en', 'Loading…')
  expect(html).toContain('role="status"')
  expect(html).toContain('aria-live="polite"')
  expect(html).toContain('Loading…')
  expect(html).toContain('football-spin')
})

it('uses the Hebrew label when the locale is Hebrew', () => {
  const html = render('he', 'טוען…')
  expect(html).toContain('טוען…')
})
