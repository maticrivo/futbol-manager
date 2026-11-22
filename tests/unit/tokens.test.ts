import { expect, it } from 'vitest'
import { generateToken, hashToken } from '@/lib/tokens'
import { readFileSync } from 'node:fs'
const globalsCss = readFileSync(
  new URL('../../src/app/globals.css', import.meta.url),
  'utf8',
)

const colorTokens = [
  'background',
  'surface',
  'surface-muted',
  'line',
  'ink',
  'muted',
  'primary',
  'primary-hover',
  'primary-soft',
  'on-primary',
  'danger',
  'danger-soft',
  'warning',
  'warning-soft',
  'focus',
]

function declarationsIn(block: string): Set<string> {
  return new Set([...block.matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1]))
}

it('generates unique tokens and hashes deterministically', () => {
  const a = generateToken()
  const b = generateToken()
  expect(a).not.toBe(b)
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(hashToken(a)).toHaveLength(64)
  expect(hashToken(a)).toBe(hashToken(a))
})

it('defines a dark-mode counterpart for every light-mode color token', () => {
  const rootMatch = globalsCss.match(/:root\s*\{([^}]*)\}/)
  const darkMatch = globalsCss.match(
    /@media \(prefers-color-scheme:\s*dark\)\s*\{\s*:root(?::not\(\[data-theme="light"\]\))?\s*\{([^}]*)\}/,
  )
  const explicitDarkMatch = globalsCss.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)

  const rootBlock = rootMatch?.[1] ?? ''
  const darkBlock = darkMatch?.[1] ?? ''
  const explicitDarkBlock = explicitDarkMatch?.[1] ?? ''

  const lightTokens = declarationsIn(rootBlock)
  const darkTokens = declarationsIn(darkBlock)
  const explicitDarkTokens = declarationsIn(explicitDarkBlock)

  for (const token of colorTokens) {
    expect(
      lightTokens.has(token),
      `missing light token --${token} in :root`,
    ).toBe(true)
    expect(
      darkTokens.has(token),
      `missing dark token --${token} in @media (prefers-color-scheme: dark)`,
    ).toBe(true)
    expect(
      explicitDarkTokens.has(token),
      `missing dark token --${token} in :root[data-theme="dark"]`,
    ).toBe(true)
  }
})