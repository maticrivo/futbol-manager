import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { expect, it } from 'vitest'
import Loading from '@/app/loading'

type Locale = 'en' | 'es' | 'he'

function render(locale: Locale) {
  const messages = JSON.parse(
    readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), 'utf8'),
  ) as { common: { loading: string } }
  return {
    label: messages.common.loading,
    html: renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <Loading />
      </NextIntlClientProvider>,
    ),
  }
}

it('announces the English label once inside the status region beside a hidden football', () => {
  const { html, label } = render('en')

  expect(html).toMatch(/<main[^>]*role="status"[^>]*aria-live="polite"[^>]*>/)
  expect(html).toMatch(
    /<main[^>]*>[\s\S]*<svg[^>]*aria-hidden="true"[\s\S]*<span class="sr-only">[^<]*<\/span>[\s\S]*<\/main>/,
  )
  expect(html).toContain(`<span class="sr-only">${label}</span>`)
  expect(html.split(label)).toHaveLength(2)
})

it('uses the real Hebrew label from the message files', () => {
  const { html, label } = render('he')

  expect(label).toBe('בטעינה…')
  expect(html).toContain(`<span class="sr-only">${label}</span>`)
  expect(html.split(label)).toHaveLength(2)
})
