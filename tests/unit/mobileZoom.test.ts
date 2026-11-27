import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8')
const mobileBlock = css.match(/@media \(max-width: 767px\) \{([\s\S]*?)\n\}/)?.[1] ?? ''

it('forces 16px text fields on phones so iOS does not zoom on focus', () => {
  expect(mobileBlock).toMatch(/input,\s*select,\s*textarea\s*\{[^}]*font-size:\s*16px/)
})

it('removes double-tap zoom and the tap delay on controls', () => {
  expect(mobileBlock).toMatch(
    /button,[\s\S]*\[role='button'\][\s\S]*touch-action:\s*manipulation/,
  )
})

it('contains mobile overscroll so Android does not reload the page', () => {
  expect(mobileBlock).toMatch(/html,\s*body\s*\{[^}]*overscroll-behavior-y:\s*contain/)
})
