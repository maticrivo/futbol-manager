import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { Button } from '@/components/ui/Button'

it.each(['dangerOutline', 'dangerGhost'] as const)('renders %s in the danger colour only', variant => {
  const html = renderToStaticMarkup(<Button variant={variant}>Withdraw</Button>)
  expect(html).toContain('text-danger')
  // `cn` keeps both of two conflicting colour utilities, so the neutral one must not be there.
  expect(html).not.toContain('text-ink')
  expect(html).not.toContain('border-line')
})
