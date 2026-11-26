import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { FootballSpinner } from '@/components/ui/FootballSpinner'

it('renders a theme-independent spinning football svg', () => {
  const html = renderToStaticMarkup(createElement(FootballSpinner))
  expect(html).toContain('viewBox="0 0 48 48"')
  expect(html).toContain('football-spin')
  expect(html).toContain('aria-hidden="true"')
  expect(html).toContain('<circle')
  expect(html).toContain('clipPath')
  expect(html).toContain('fill="#f7f7f2"')
  expect(html).toContain('fill="#161a18"')
})

it('honors the size prop', () => {
  const html = renderToStaticMarkup(createElement(FootballSpinner, { size: 72 }))
  expect(html).toContain('width="72"')
  expect(html).toContain('height="72"')
})

it('stops spinning when the user prefers reduced motion', () => {
  const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8')
  expect(css).toContain('.football-spin')
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
})
