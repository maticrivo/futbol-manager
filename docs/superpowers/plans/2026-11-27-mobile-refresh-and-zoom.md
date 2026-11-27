# Mobile Pull-to-Refresh and Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native-feeling pull-to-refresh gesture to signed-in mobile screens and lock page zoom as far as the platform allows, without changing desktop behaviour.

**Architecture:** A small client component owns the touch gesture and calls `router.refresh()` through `useTransition`; pure helpers in `src/lib/pull-to-refresh.ts` hold the gesture decisions and are unit tested. Zoom is handled declaratively: a pure viewport builder adds the zoom-lock meta values, and a mobile-only CSS block fixes 16px fields, double-tap zoom, and overscroll.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, TypeScript, Vitest, `react-dom/server` for component markup tests.

**Spec:** `docs/superpowers/specs/2026-11-27-mobile-refresh-and-zoom-design.md`

## Global Constraints

- No new runtime dependencies.
- Mobile-only behaviour below `md` (768px); desktop layout and field sizing stay unchanged.
- Pull-to-refresh appears only for signed-in members, never on auth pages.
- All new copy lives in `messages/en.json`, `es.json`, and `he.json`; no hard-coded visible strings.
- Respect `prefers-reduced-motion`, dark mode, RTL, and screen readers.
- Existing server actions, auth, PWA/service-worker, and data fetching stay untouched.
- Every task ends with its focused test passing and a commit.

## Review Focus

- **Horizontal or multi-touch drags at scroll top:** a sideways swipe on the admin sub-nav, or a two-finger gesture, must scroll/navigate normally and never arm a refresh. `isDownwardPull` and `canStartPull` are pinned in Task 1.
- **Pull beginning below the top:** dragging down after scrolling into the page must scroll normally, not show the indicator. `canStartPull`'s `scrollY` case is pinned in Task 1.
- **Desktop or mid-gesture resize:** the indicator must never appear at `md` and above, and crossing the breakpoint must clear a half-started pull. `canStartPull`'s `mobile` case and the component's `matchMedia` reset are pinned in Tasks 1 and 2.
- **iOS focus zoom on every field type:** text, email, tel, url, number, date, month, select, and textarea must all be 16px on phones. The CSS source test in Task 4 pins the rule; the manual matrix confirms the device behaviour.
- **Zoom lock leaking into desktop or theme metadata:** the viewport lock must sit beside, not replace, the existing theme colors, and the 16px/touch rules must stay inside the mobile media query. Tasks 3 and 4 pin both.

---

### Task 1: Gesture helpers

**Files:**
- Create: `src/lib/pull-to-refresh.ts`
- Test: `tests/unit/pull-to-refresh.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export const PULL_THRESHOLD = 64`
  - `export const PULL_MAX = 96`
  - `export function canStartPull(input: { touchCount: number; scrollY: number; mobile: boolean; refreshing: boolean }): boolean`
  - `export function isDownwardPull(input: { deltaX: number; deltaY: number }): boolean`
  - `export function pullDistance(deltaY: number): number`
  - `export function shouldRefresh(distance: number): boolean`

- [ ] **Step 1: Write the failing helper tests**

```ts
import { expect, it } from 'vitest'
import {
  canStartPull,
  isDownwardPull,
  PULL_MAX,
  PULL_THRESHOLD,
  pullDistance,
  shouldRefresh,
} from '@/lib/pull-to-refresh'

const atTop = { touchCount: 1, scrollY: 0, mobile: true, refreshing: false }

it('starts only for one touch at the top of a mobile screen', () => {
  expect(canStartPull(atTop)).toBe(true)
  expect(canStartPull({ ...atTop, touchCount: 2 })).toBe(false)
  expect(canStartPull({ ...atTop, scrollY: 1 })).toBe(false)
  expect(canStartPull({ ...atTop, mobile: false })).toBe(false)
  expect(canStartPull({ ...atTop, refreshing: true })).toBe(false)
})

it('only treats a downward, mostly vertical drag as a pull', () => {
  expect(isDownwardPull({ deltaX: 0, deltaY: 20 })).toBe(true)
  expect(isDownwardPull({ deltaX: 4, deltaY: 20 })).toBe(true)
  expect(isDownwardPull({ deltaX: 30, deltaY: 5 })).toBe(false)
  expect(isDownwardPull({ deltaX: 0, deltaY: -20 })).toBe(false)
  expect(isDownwardPull({ deltaX: 0, deltaY: 0 })).toBe(false)
})

it('applies resistance and caps the pull distance', () => {
  expect(pullDistance(-10)).toBe(0)
  expect(pullDistance(0)).toBe(0)
  expect(pullDistance(20)).toBe(10)
  expect(pullDistance(400)).toBe(PULL_MAX)
})

it('arms the refresh at the threshold', () => {
  expect(shouldRefresh(PULL_THRESHOLD - 1)).toBe(false)
  expect(shouldRefresh(PULL_THRESHOLD)).toBe(true)
  expect(shouldRefresh(PULL_MAX)).toBe(true)
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/pull-to-refresh.test.ts`
Expected: FAIL — cannot resolve `@/lib/pull-to-refresh`.

- [ ] **Step 3: Implement the helpers in `src/lib/pull-to-refresh.ts`**

Use a `0.5` resistance factor, clamp negative deltas to `0`, and cap the result at `PULL_MAX`. `isDownwardPull` returns true only when `deltaY > 0` and `deltaY > Math.abs(deltaX)`. `canStartPull` returns true only when every input matches above.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/pull-to-refresh.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pull-to-refresh.ts tests/unit/pull-to-refresh.test.ts
git commit -m "feat: add pull-to-refresh gesture helpers"
```

---

### Task 2: Pull-to-refresh component and i18n

**Files:**
- Create: `src/components/PullToRefresh.tsx`
- Test: `tests/unit/pullToRefresh.test.tsx`
- Modify: `src/components/Nav.tsx:32-39`
- Modify: `messages/en.json` (`common.refreshing`)
- Modify: `messages/es.json` (`common.refreshing`)
- Modify: `messages/he.json` (`common.refreshing`)

**Interfaces:**
- Consumes: `canStartPull`, `isDownwardPull`, `pullDistance`, `shouldRefresh`, `PULL_THRESHOLD`, and `PULL_MAX` from Task 1.
- Produces:
  - `export function PullIndicator(props: { distance: number; refreshing: boolean; label: string }): React.ReactElement`
  - `export default function PullToRefresh(): React.ReactElement | null`
- Copy values: English `Refreshing…`, Spanish `Actualizando…`, Hebrew `מרענן…`.

- [ ] **Step 1: Write the failing indicator test**

```tsx
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
  expect(html).toContain('football-spin')
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/pullToRefresh.test.tsx`
Expected: FAIL — cannot resolve `@/components/PullToRefresh`.

- [ ] **Step 3: Add the `refreshing` copy to all three message files**

Add `"refreshing"` to the `common` object in `messages/en.json`, `messages/es.json`, and `messages/he.json` with the three copy values in the Interfaces block.

- [ ] **Step 4: Implement the component**

`src/components/PullToRefresh.tsx` must be a `'use client'` component:

- `PullIndicator` renders a `md:hidden`, fixed, `pointer-events-none`, top-centre wrapper positioned at `top-14` so the pill sits below the mobile header. The pill uses theme tokens (`bg-surface`, `border-line`, `text-primary`, `shadow-card`), the existing `Icon name="refresh"`, `aria-hidden="true"` on the icon, `role="status"`, `aria-live="polite"`, and an `sr-only` label only while `refreshing` is true.
- At rest the pill is fully hidden above the viewport. Translate it from `-96px` to `0` as `distance` goes from `0` to `PULL_THRESHOLD`, then hold at `0`; rotate the icon with `(distance / PULL_THRESHOLD) * 180` degrees.
- While `refreshing`, apply the existing `football-spin` class to the icon so it reuses the reduced-motion rule in `globals.css`.
- `PullToRefresh` reads `useTranslations('common')`, `useRouter()`, and `useTransition()`. Keep the current distance, start point, and refreshing flag in refs so the window listeners never read stale values.
- Attach `touchstart` (passive), `touchmove` (non-passive), `touchend`, and `touchcancel` to `window` in a `useEffect`. Start only when `canStartPull({ touchCount, scrollY, mobile: matchMedia('(max-width: 767px)').matches, refreshing })` is true. Before `preventDefault`, require `isDownwardPull`, and ignore any `touchmove` with more or fewer than one touch (reset the gesture instead). Set the distance with `pullDistance(deltaY)`.
- On release, call `shouldRefresh(distance)`; when true, set the distance to `PULL_THRESHOLD`, set refreshing, start a 500ms minimum timer, and call `startTransition(() => router.refresh())`. Keep the spinner up while either the transition is pending or the minimum timer has not elapsed. Reset the distance to `0` when finished.
- Reset the gesture on `touchcancel`, `orientationchange`, and when the mobile media query stops matching. Remove every listener and clear every timer in cleanup.

- [ ] **Step 5: Mount the component**

Mount `<PullToRefresh />` inside the active-member fragment in `Nav.tsx`, beside `<MobileHeader />`, so auth pages never render it.

- [ ] **Step 6: Run the test and lint**

Run: `npx vitest run tests/unit/pullToRefresh.test.tsx`
Expected: PASS — 2 tests.

Run: `npm run lint`
Expected: PASS with no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/PullToRefresh.tsx tests/unit/pullToRefresh.test.tsx src/components/Nav.tsx messages/en.json messages/es.json messages/he.json
git commit -m "feat: add mobile pull-to-refresh"
```

---

### Task 3: Viewport zoom lock

**Files:**
- Create: `src/lib/viewport.ts`
- Modify: `src/app/layout.tsx:29-39`
- Test: `tests/unit/viewport.test.ts`

**Interfaces:**
- Consumes: `Theme` from `@/lib/theme`.
- Produces: `export function viewportForTheme(theme: Theme): Viewport`.

- [ ] **Step 1: Write the failing viewport test**

```ts
import { expect, it } from 'vitest'
import { viewportForTheme } from '@/lib/viewport'

const zoomLock = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
} as const

it('locks zoom in every theme', () => {
  for (const theme of ['system', 'light', 'dark'] as const) {
    expect(viewportForTheme(theme)).toMatchObject(zoomLock)
  }
})

it('keeps the existing theme colors beside the zoom lock', () => {
  expect(viewportForTheme('light').themeColor).toBe('#f6f5f2')
  expect(viewportForTheme('dark').themeColor).toBe('#101412')
  expect(viewportForTheme('system').themeColor).toEqual([
    { media: '(prefers-color-scheme: light)', color: '#f6f5f2' },
    { media: '(prefers-color-scheme: dark)', color: '#101412' },
  ])
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/viewport.test.ts`
Expected: FAIL — cannot resolve `@/lib/viewport`.

- [ ] **Step 3: Implement `viewportForTheme` and use it in the layout**

Return the zoom-lock values above with the light color `#f6f5f2`, the dark color `#101412`, and the existing two-entry media array for `system`. Import the helper in `src/app/layout.tsx` and replace the body of `generateViewport` with the theme lookup plus `return viewportForTheme(theme)`; keep the existing `cookies()` and `parseTheme` calls.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/viewport.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/viewport.ts src/app/layout.tsx tests/unit/viewport.test.ts
git commit -m "feat: lock mobile viewport zoom"
```

---

### Task 4: Mobile field size, touch action, and overscroll

**Files:**
- Modify: `src/app/globals.css`
- Test: `tests/unit/mobileZoom.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a single `@media (max-width: 767px)` block in `globals.css`.

- [ ] **Step 1: Write the failing CSS test**

```ts
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/mobileZoom.test.ts`
Expected: FAIL — the mobile block does not exist yet.

- [ ] **Step 3: Add the mobile CSS block after the `body` rule in `globals.css`**

```css
@media (max-width: 767px) {
  html,
  body {
    overscroll-behavior-y: contain;
  }

  input,
  select,
  textarea {
    font-size: 16px;
  }

  button,
  a,
  [role='button'],
  input,
  select,
  textarea {
    touch-action: manipulation;
  }
}
```

The block must stay unlayered, after `@import "tailwindcss"`, so the 16px rule overrides the `text-sm` utilities on existing forms. Do not move it inside `@theme` or a layer.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/mobileZoom.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css tests/unit/mobileZoom.test.ts
git commit -m "feat: stop mobile zoom and overscroll"
```

---

## Final verification

- [ ] Ensure Postgres is running: `docker compose up -d db`
- [ ] `npm run lint` — passes with no new warnings or errors.
- [ ] `npm test` — full suite passes.
- [ ] `npm run build` — production build succeeds.
- [ ] Manual, iPhone Safari standalone:
  - Pull down at the top of Home, Bill, Profile, and Admin; the indicator follows the finger and the data refetches.
  - A short pull snaps back without refreshing; pulling up or mid-page scrolls normally.
  - Pull while the roster is visible and confirm scroll position and countdown state survive.
  - Focus text, email, tel, url, number, date, month, select, and textarea fields; the page does not zoom.
  - Pinch still works on iOS and is blocked on Android; double-tap does not zoom.
- [ ] Manual, Android Chrome standalone: same pull checks, no native full-page reload, pinch and double-tap blocked.
- [ ] Manual, desktop at 768px and above: no indicator, fields remain 14px, layout unchanged.
- [ ] Hebrew RTL: indicator stays centred, label announces correctly.
- [ ] Reduced-motion mode: indicator appears without continuous spinning.
