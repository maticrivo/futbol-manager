# Header Logo and Active Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the app logo to every top header, add a mobile top header, and mark the active item in the desktop and mobile navigation with a soft green pill.

**Architecture:** A shared client `NavLink` computes the active route from `usePathname()` and renders either a desktop pill or a mobile tab. `Logo`, `Brand`, and `MobileHeader` are small presentational components; the existing route helpers move to `src/lib/nav.ts` so the client component never imports the server nav module.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Tailwind CSS v4, `next/image`, Vitest with `renderToStaticMarkup`.

**Spec:** `docs/superpowers/specs/2026-11-26-header-logo-active-nav-design.md`

## Global Constraints

- No new dependencies.
- The logo is the existing `/app-icon.svg`; no new artwork.
- Active desktop style is exactly `bg-primary-soft text-primary`; inactive is `text-muted hover:text-ink`.
- Active mobile style is exactly a `bg-primary-soft` pill around the emoji plus `text-primary` on the link.
- Every active link sets `aria-current="page"`.
- The mobile bottom bar stays fixed and its four/five tab widths stay equal.
- The full test suite needs Postgres; run all `tests/unit` with the DB-free config if Postgres is unavailable.

## Review Focus

- **Home alias:** home stays active on `/match/*`, and only one item is active at a time.
- **Admin subtree:** admin stays active on `/admin`, `/admin/members`, `/admin/money`, `/admin/settings`, `/admin/audit`, and `/admin/matches/[id]`.
- **Mobile layout:** the active pill must not change the tab width or height, and the label must not wrap.
- **Breakpoints:** exactly one header shows at a time (mobile header below `md`, desktop header at `md` and up), including for signed-out users.
- **RTL/Hebrew:** logo and name order, pill padding, and tab alignment must not break in `dir="rtl"`.

---

### Task 1: Move active-route helpers into `src/lib/nav.ts`

**Files:**
- Create: `src/lib/nav.ts`
- Modify: `src/components/Nav.tsx`
- Modify: `tests/unit/nav.test.ts:1`

**Interfaces:**
- Produces:
  - `isAdminTabActive(pathname: string): boolean`
  - `isPrimaryNavActive(href: string, pathname: string): boolean`

- [ ] **Step 1: Point the existing test at the new module**

In `tests/unit/nav.test.ts`, change the import to:

```ts
import { isAdminTabActive, isPrimaryNavActive } from '@/lib/nav'
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/nav.test.ts --config .superpowers/tmp/vitest.unit.config.mts`
Expected: FAIL — cannot resolve `@/lib/nav`.

- [ ] **Step 3: Create `src/lib/nav.ts` with the two helpers moved verbatim from `Nav.tsx`**

```ts
export function isAdminTabActive(pathname: string): boolean {
  return pathname.startsWith('/admin')
}

export function isPrimaryNavActive(href: string, pathname: string): boolean {
  if (href === '/') {
    return pathname === '/' || pathname.startsWith('/match')
  }
  return pathname.startsWith(href)
}
```

- [ ] **Step 4: Remove the helper definitions from `src/components/Nav.tsx`**

Delete both exported functions and their doc-free bodies; leave the imports of
`getCurrentMember`, `DesktopNav`, and `BottomNav` untouched.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/nav.test.ts --config .superpowers/tmp/vitest.unit.config.mts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav.ts src/components/Nav.tsx tests/unit/nav.test.ts
git commit -m "refactor: move nav active helpers to lib"
```

---

### Task 2: Shared `NavLink` with active styles

**Files:**
- Create: `src/components/NavLink.tsx`
- Test: `tests/unit/navLink.test.tsx`

**Interfaces:**
- Consumes: `isPrimaryNavActive` from Task 1; `cn` from `@/lib/cn`.
- Produces: default-exported `NavLink({ href, label, icon, variant = 'desktop' }: { href: string; label: string; icon?: string; variant?: 'desktop' | 'mobile' })`.

- [ ] **Step 1: Write the failing test**

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/navLink.test.tsx --config .superpowers/tmp/vitest.unit.config.mts`
Expected: FAIL — cannot resolve `@/components/NavLink`.

- [ ] **Step 3: Create `src/components/NavLink.tsx`**

Desktop render: a `Link` with base classes
`rounded-[var(--radius-pill)] px-3 py-1.5 transition-colors`, active
`bg-primary-soft text-primary`, inactive `text-muted hover:text-ink`.

Mobile render: a `Link` with base classes
`flex flex-1 flex-col items-center justify-center py-1 text-xs font-medium transition-colors`,
active `text-primary`, inactive `text-muted hover:text-ink`; inside it a
`span aria-hidden` with base classes
`flex h-7 w-12 items-center justify-center rounded-full transition-colors`,
adding `bg-primary-soft` when active, containing the emoji; then the label.

Both variants set `aria-current={active ? 'page' : undefined}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/navLink.test.tsx --config .superpowers/tmp/vitest.unit.config.mts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/NavLink.tsx tests/unit/navLink.test.tsx
git commit -m "feat: add active state to nav links"
```

---

### Task 3: Brand, mobile header, and wiring

**Files:**
- Create: `src/components/ui/Logo.tsx`
- Create: `src/components/Brand.tsx`
- Create: `src/components/MobileHeader.tsx`
- Modify: `src/components/Nav.tsx`
- Modify: `src/components/DesktopNav.tsx`
- Modify: `src/components/BottomNav.tsx`
- Test: `tests/unit/headerBranding.test.tsx`

**Interfaces:**
- Consumes: `NavLink` from Task 2; `cn` from `@/lib/cn`.
- Produces:
  - `Logo({ size = 28, className }: { size?: number; className?: string })` (named export)
  - default `Brand({ name, className }: { name: string; className?: string })`
  - default `MobileHeader({ name }: { name: string })`

- [ ] **Step 1: Write the failing test**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import Brand from '@/components/Brand'
import MobileHeader from '@/components/MobileHeader'
import { Logo } from '@/components/ui/Logo'

it('renders the app icon at the requested size', () => {
  const html = renderToStaticMarkup(<Logo size={32} />)
  expect(html).toContain('src="/app-icon.svg"')
  expect(html).toContain('width="32"')
  expect(html).toContain('height="32"')
})

it('renders the logo beside the app name', () => {
  const html = renderToStaticMarkup(<Brand name="Tuesday Football" />)
  expect(html).toContain('src="/app-icon.svg"')
  expect(html).toContain('Tuesday Football')
})

it('renders a mobile-only header', () => {
  const html = renderToStaticMarkup(<MobileHeader name="Tuesday Football" />)
  expect(html).toContain('md:hidden')
  expect(html).toContain('src="/app-icon.svg"')
  expect(html).toContain('Tuesday Football')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/headerBranding.test.tsx --config .superpowers/tmp/vitest.unit.config.mts`
Expected: FAIL — cannot resolve the new component modules.

- [ ] **Step 3: Create `src/components/ui/Logo.tsx`**

Use `next/image` with `src="/app-icon.svg"`, `alt=""`, `width={size}`,
`height={size}`, and classes `rounded-[6px] ring-1 ring-line` merged through
`cn`; default `size = 28`.

- [ ] **Step 4: Create `src/components/Brand.tsx` and `src/components/MobileHeader.tsx`**

`Brand` renders a `span` with `flex items-center gap-2`, the `Logo`, and the
name in `text-lg font-semibold text-ink`.

`MobileHeader` renders
`<header className="md:hidden border-b border-line bg-surface">` containing
`<div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">`
with `<Brand name={name} />`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/headerBranding.test.tsx --config .superpowers/tmp/vitest.unit.config.mts`
Expected: PASS (3 tests).

- [ ] **Step 6: Wire the components in**

- `Nav.tsx`: import `Brand` and `MobileHeader`. In the signed-out branch replace
  the name span with `<Brand name={t('common.appName')} />`. In the active-member
  branch render `<MobileHeader name={t('common.appName')} />` before `DesktopNav`.
- `DesktopNav.tsx`: import `Brand` and `NavLink`; replace the name span with
  `<Brand name={t('common.appName')} />`; replace the four/five manual `<Link>`
  entries with `NavLink` (desktop variant) and change the nav list gap from
  `gap-4` to `gap-1`.
- `BottomNav.tsx`: import `NavLink`; replace each manual `<Link>` with
  `<NavLink href="…" label={t('…')} icon="…" variant="mobile" />`, preserving
  the existing hrefs and emoji.

- [ ] **Step 7: Run the full unit suite, lint, and build**

Run: `npx vitest run tests/unit --config .superpowers/tmp/vitest.unit.config.mts && npm run lint && npm run build`
Expected: all unit tests pass, lint clean, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/Logo.tsx src/components/Brand.tsx src/components/MobileHeader.tsx src/components/Nav.tsx src/components/DesktopNav.tsx src/components/BottomNav.tsx tests/unit/headerBranding.test.tsx
git commit -m "feat: brand the header and add a mobile top bar"
```

---

### Task 4: Manual visual pass

**Files:** none unless a defect is found.

- [ ] **Step 1: Check both breakpoints**

Run `npm run dev` when Postgres is available, then view a page above and below
`md`.
Expected: exactly one header is visible, with the logo and app name; mobile also
keeps the fixed bottom bar.

- [ ] **Step 2: Check active states**

Visit home, a match page, bill, admin (dashboard and a subpage), and profile.
Expected: one soft green pill on desktop and one pill/tinted label on mobile,
and only the matching tab is active; `/match/*` highlights home and all
`/admin/*` pages highlight admin.

- [ ] **Step 3: Check Hebrew**

Switch to Hebrew.
Expected: logo and name stay aligned in RTL, and pills do not clip text.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish header branding"
```
