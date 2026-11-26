# Page Loading Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a spinning football in the content area on every client navigation while the next server-rendered page loads.

**Architecture:** One route-level `src/app/loading.tsx` fallback covers every page under the shared root layout. It renders a small client-only SVG `FootballSpinner` component and a localized screen-reader label. Spin animation and its reduced-motion fallback live in `globals.css`.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Tailwind CSS v4, Vitest with `renderToStaticMarkup`.

**Spec:** `docs/superpowers/specs/2026-11-26-page-loading-indicator-design.md`

## Global Constraints

- No new dependencies.
- The full test suite expects the Postgres test database; run `docker compose up -d` first if it is not already running.
- Ball colors are fixed (`#f7f7f2` ball, `#161a18` patches and stroke) so the loader reads on both light and dark themes.
- `prefers-reduced-motion: reduce` stops the spin; the ball stays visible.
- The loading label comes from the existing `common.loading` message in all three locales.
- Do not change data fetching, caching, or prefetching.

## Review Focus

- **Fast navigation flash:** a navigation that finishes almost immediately may briefly show the ball; it must never block the new page or require a click to dismiss.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, the ball must be visible and static, not hidden.
- **Dark theme:** the white ball must stay visible against `--background: #101412`.
- **Mobile safe area:** on phones the centered ball must clear the fixed 64px bottom nav.
- **Screen readers:** loading is announced once through `role="status"` with the localized `common.loading` text, and the SVG itself is hidden.

---

### Task 1: Football spinner component and animation

**Files:**
- Create: `src/components/ui/FootballSpinner.tsx`
- Modify: `src/app/globals.css` (append at end)
- Test: `tests/unit/footballSpinner.test.ts`

**Interfaces:**
- Consumes: `cn` from `@/lib/cn`.
- Produces: `export function FootballSpinner({ size?: number; className?: string })` — renders an `aria-hidden` SVG with class `football-spin`, default size 60.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/footballSpinner.test.ts`
Expected: FAIL — cannot resolve `@/components/ui/FootballSpinner`.

- [ ] **Step 3: Create `src/components/ui/FootballSpinner.tsx`**

The geometry is pinned: a white circle clipped to r22, a central pentagon, and five rotated outer pentagons joined by seam lines.

```tsx
import { cn } from '@/lib/cn'

export function FootballSpinner({ size = 60, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={cn('football-spin', className)}
    >
      <clipPath id="football-clip">
        <circle cx="24" cy="24" r="22" />
      </clipPath>
      <circle cx="24" cy="24" r="22" fill="#f7f7f2" stroke="#161a18" strokeWidth="2" />
      <g clipPath="url(#football-clip)">
        <polygon
          points="24,16.6 31.04,21.71 28.35,29.99 19.65,29.99 16.96,21.71"
          fill="#161a18"
        />
        {[0, 72, 144, 216, 288].map((angle) => (
          <g key={angle} transform={`rotate(${angle} 24 24)`}>
            <line x1="24" y1="16.6" x2="24" y2="13.9" stroke="#161a18" strokeWidth="1.6" />
            <polygon
              points="24,13.9 17.91,9.48 20.24,2.32 27.76,2.32 30.09,9.48"
              fill="#161a18"
              stroke="#161a18"
              strokeWidth="1.2"
            />
          </g>
        ))}
      </g>
      <circle cx="24" cy="24" r="22" fill="none" stroke="#161a18" strokeWidth="2" />
    </svg>
  )
}
```

- [ ] **Step 4: Append the animation to `src/app/globals.css`**

```css
@keyframes football-spin {
  to {
    transform: rotate(360deg);
  }
}

.football-spin {
  transform-origin: center;
  animation: football-spin 1s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .football-spin {
    animation: none;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/footballSpinner.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/FootballSpinner.tsx src/app/globals.css tests/unit/footballSpinner.test.ts
git commit -m "feat: add spinning football loader component"
```

---

### Task 2: Route-level loading fallback

**Files:**
- Create: `src/app/loading.tsx`
- Test: `tests/unit/loadingIndicator.test.ts`

**Interfaces:**
- Consumes: `FootballSpinner` from Task 1; `useTranslations('common')` from `next-intl`.
- Produces: default-exported `Loading()` React component picked up automatically by the App Router for every segment under `src/app/`.

- [ ] **Step 1: Write the failing test**

```ts
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { expect, it } from 'vitest'
import Loading from '@/app/loading'

function render(locale: string, label: string) {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale, messages: { common: { loading: label } } },
      createElement(Loading),
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/loadingIndicator.test.ts`
Expected: FAIL — cannot resolve `@/app/loading`.

- [ ] **Step 3: Create `src/app/loading.tsx`**

It must be a client component so `useTranslations` reads the already-mounted provider without extra request data.

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { FootballSpinner } from '@/components/ui/FootballSpinner'

export default function Loading() {
  const t = useTranslations('common')
  return (
    <main
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] w-full items-center justify-center px-4 pb-24 pt-10"
    >
      <FootballSpinner />
      <span className="sr-only">{t('loading')}</span>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/loadingIndicator.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass; lint reports no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/loading.tsx tests/unit/loadingIndicator.test.ts
git commit -m "feat: show a spinning football while pages load"
```

---

### Task 3: Manual navigation and build verification

**Files:** none to change unless verification finds a defect.

- [ ] **Step 1: Build for production**

Run: `npm run build`
Expected: build succeeds with the new `loading` route included.

- [ ] **Step 2: Check navigation in the browser**

Run: `npm run dev`, then with network throttling set to Slow 3G, click home → bill → admin → profile.
Expected on each navigation: the nav bars stay visible and tappable, the content area shows the spinning football until the page arrives, and the ball never covers the nav.

- [ ] **Step 3: Check themes, motion, mobile, and Hebrew**

Expected: the white ball is clearly visible in light and dark themes; with reduced motion enabled in dev tools the ball is static but visible; on a phone-width viewport the ball sits above the fixed bottom nav; switching to Hebrew keeps the ball centered and announces the Hebrew label.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish page loading indicator"
```
