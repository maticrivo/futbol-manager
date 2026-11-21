# Mobile-first Calm Utility Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the entire Weekly Football Manager app (player and admin flows) to a mobile-first Calm Utility design system with warm off-white surfaces, white rounded cards, bottom tab navigation, status chips, and tabular numbers while keeping all domain rules, server actions, RTL, and dark mode fully intact.

**Architecture:** We introduce CSS design tokens in `globals.css` (light & dark), fonts (Geist + Noto Sans Hebrew), a set of shared React UI primitives (`src/components/ui/`), a responsive app shell with mobile bottom tabs and desktop top bar, and migrate screens page-by-page from raw framework defaults to the new design system.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, next-intl, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-21-mobile-first-ui-redesign-design.md`

## Global Constraints

- All monetary amounts in integer agorot; time in `Asia/Jerusalem`.
- Hebrew RTL parity and trilingual support (`he`, `en`, `es`) required.
- No domain behavior, database schema, or action signature changes.
- Dark mode follows system preferences via CSS variables.
- Minimum touch target size 44×44px on mobile.

## Review Focus

1. **RTL Class Guard:** A test scanning component files for non-logical spacing (`ml-`, `mr-`, etc.) and directional utilities to prevent broken RTL layout. (*Pinned to Task 1 in `tests/unit/rtl.test.ts`*).
2. **Message Key Parity:** All three locale files (`en`, `he`, `es`) must share identical key structure including new labels. (*Pinned to existing `tests/domain/profilePage.test.ts` and updated in Task 3-8*).
3. **Attendance Display State:** "Not set" in attendance is display-only with no new third action. (*Pinned to Task 7 in `tests/domain/adminMatchActions.test.ts` or unit test*).
4. **Active Admin State on Nested Routes:** Admin bottom tab and sub-nav pill must stay active on `/admin/matches/*`. (*Pinned to Task 3 in `tests/unit/nav.test.ts`*).
5. **Token Completeness:** Every light-mode semantic color token must have a dark-mode counterpart. (*Pinned to Task 1 in `tests/unit/tokens.test.ts`*).

---

### Task 1: Foundation — Tokens, Fonts, Helpers & RTL Guard

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/lib/cn.ts`
- Create: `tests/unit/cn.test.ts`
- Create: `tests/unit/rtl.test.ts`
- Modify: `tests/unit/tokens.test.ts`

**Interfaces:**
- Consumes: Tailwind v4 config, next/font
- Produces: CSS custom properties for Calm Utility theme, Noto Sans Hebrew font integration, `cn` utility, RTL scan test.

- [ ] **Step 1: Write failing test for `cn` utility and dark-mode token completeness in `tests/unit/cn.test.ts` and `tests/unit/tokens.test.ts`**

```ts
import { expect, it } from 'vitest'
import { cn } from '@/lib/cn'

it('merges class names correctly', () => {
  expect(cn('foo bar', { baz: true, qux: false })).toBe('foo bar baz')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/unit/cn.test.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Implement `src/lib/cn.ts`, update `globals.css` with Calm Utility tokens, and add `tests/unit/rtl.test.ts`**

Create `src/lib/cn.ts`:
```ts
export function cn(...inputs: Array<string | undefined | null | false | Record<string, boolean>>): string {
  return inputs
    .flatMap(input => {
      if (!input) return []
      if (typeof input === 'string') return input
      return Object.entries(input)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key)
    })
    .join(' ')
}
```

Update `src/app/globals.css` with the Calm Utility theme variables and dark mode media queries. Add `tests/unit/rtl.test.ts` to scan for `\b(ml|mr|pl|pr)-` in `src/`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test tests/unit/cn.test.ts tests/unit/rtl.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/cn.ts src/app/globals.css tests/unit/cn.test.ts tests/unit/rtl.test.ts
git commit -m "feat: add design tokens, fonts, cn utility, and rtl guard"
```

---

### Task 2: UI Primitives & Icons

**Files:**
- Create: `src/components/ui/icons.tsx`
- Create: `src/components/ui/Card.tsx`
- Create: `src/components/ui/PageHeader.tsx`
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Badge.tsx`
- Create: `src/components/ui/Avatar.tsx`
- Create: `src/components/ui/Field.tsx`
- Create: `src/components/ui/InlineMessage.tsx`
- Create: `src/components/ui/EmptyState.tsx`
- Create: `src/components/ui/Stat.tsx`
- Create: `src/components/ui/ProgressBar.tsx`
- Create: `tests/unit/ui.test.ts`

**Interfaces:**
- Consumes: `src/lib/cn.ts`, design tokens
- Produces: Reusable UI primitives (`Card`, `PageHeader`, `Button`, `Badge`, `Avatar`, `Field`, `InlineMessage`, `EmptyState`, `Stat`, `ProgressBar`, `Icons`)

- [ ] **Step 1: Write failing test for `initials` and primitive rendering in `tests/unit/ui.test.ts`**

```ts
import { expect, it } from 'vitest'
import { initials } from '@/components/ui/Avatar'

it('computes initials correctly for various names', () => {
  expect(initials('Noam Levi')).toBe('NL')
  expect(initials('Yossi')).toBe('YO')
  expect(initials('נועם לוי')).toBe('נל')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/unit/ui.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement primitives in `src/components/ui/` and `initials` in `Avatar.tsx`**

Implement `Avatar.tsx` with `initials()` helper, plus all primitive components using clean Tailwind classes adhering to Calm Utility tokens.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test tests/unit/ui.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ tests/unit/ui.test.ts
git commit -m "feat: add ui primitives, icons, and avatar initials helper"
```

---

### Task 3: App Shell, Navigation & Message Keys

**Files:**
- Modify: `messages/en.json`, `messages/he.json`, `messages/es.json`
- Create: `src/components/BottomNav.tsx`
- Create: `src/components/DesktopNav.tsx`
- Modify: `src/components/AdminNav.tsx`
- Modify: `src/components/Nav.tsx`
- Modify: `src/app/layout.tsx`
- Create: `tests/unit/nav.test.ts`

**Interfaces:**
- Consumes: Primitives, `next-intl`
- Produces: Responsive mobile bottom tab bar, desktop top bar, admin sub-nav pills, updated message keys.

- [ ] **Step 1: Write failing test for navigation active state logic in `tests/unit/nav.test.ts`**

```ts
import { expect, it } from 'vitest'
import { isAdminTabActive, isPrimaryNavActive } from '@/components/Nav'

it('determines active nav state correctly', () => {
  expect(isAdminTabActive('/admin/matches/3')).toBe(true)
  expect(isPrimaryNavActive('/', '/')).toBe(true)
  expect(isPrimaryNavActive('/bill', '/')).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/unit/nav.test.ts`
Expected: FAIL

- [ ] **Step 3: Update message files (`en`, `he`, `es`), implement Nav components, and update `RootLayout`**

Add new translation keys (`match.whoIsGoing`, `match.capacityOf`, `match.full`, `match.payNote`, `bill.amountDue`, `bill.settledChip`, `profile.language`, `queue.reserved`, `admin.dashboard.manage`, `admin.dashboard.manageMatch`, `admin.money.memberBalances`, `admin.match.schedule`, `admin.match.moneySection`, `common.backToSignIn`, `notFound.*`) to all three JSON files. Implement `BottomNav`, `AdminNav`, update `Nav.tsx` and `layout.tsx`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test tests/unit/nav.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add messages/ src/components/BottomNav.tsx src/components/DesktopNav.tsx src/components/AdminNav.tsx src/components/Nav.tsx src/app/layout.tsx tests/unit/nav.test.ts
git commit -m "feat: add mobile bottom nav, desktop top bar, admin sub-nav, and message keys"
```

---

### Task 4: Home (Match Screen & Mobile Action Bar)

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/MatchCard.tsx`
- Modify: `src/components/Countdown.tsx`
- Modify: `src/components/RosterList.tsx`
- Modify: `src/components/QueuePanel.tsx`
- Modify: `src/components/GuestForm.tsx`
- Modify: `src/components/MatchActionForm.tsx`
- Create: `src/components/MatchHero.tsx`
- Create: `src/components/MobileActionBar.tsx`
- Create: `tests/unit/matchHome.test.ts`

**Interfaces:**
- Consumes: UI primitives, `MatchView`
- Produces: Calm Utility styled home match screen, countdown hero, sticky mobile signup/withdraw action bar.

- [ ] **Step 1: Write failing test for phase tone and primary action logic in `tests/unit/matchHome.test.ts`**

```ts
import { expect, it } from 'vitest'
import { matchPhaseTone } from '@/components/MatchHero'

it('maps match phases to badge tones', () => {
  expect(matchPhaseTone('open')).toBe('success')
  expect(matchPhaseTone('locked')).toBe('neutral')
  expect(matchPhaseTone('cancelled')).toBe('danger')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/unit/matchHome.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `MatchHero`, `MobileActionBar`, and restyle `MatchCard`, `Countdown`, `RosterList`, `QueuePanel`, `GuestForm`, and `page.tsx`**

Refactor the home components to use `Card`, `Badge`, `Button`, `Stat`, `ProgressBar`, and `InlineMessage`. Add mobile sticky action bar.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test tests/unit/matchHome.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/MatchCard.tsx src/components/Countdown.tsx src/components/RosterList.tsx src/components/QueuePanel.tsx src/components/GuestForm.tsx src/components/MatchActionForm.tsx src/components/MatchHero.tsx src/components/MobileActionBar.tsx tests/unit/matchHome.test.ts
git commit -m "feat: redesign home match screen with calm utility tokens and mobile action bar"
```

---

### Task 5: Bill, Profile & Auth Pages

**Files:**
- Modify: `src/app/bill/page.tsx`
- Modify: `src/app/profile/page.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/login/pending/page.tsx`
- Modify: `src/app/login/expired/page.tsx`
- Modify: `src/components/BillTable.tsx`
- Modify: `src/components/NotificationPrefs.tsx`
- Modify: `src/components/PushSetup.tsx`
- Modify: `src/components/ProfileForm.tsx`
- Modify: `src/components/LoginForm.tsx`

**Interfaces:**
- Consumes: Primitives, billing domain helpers, auth actions
- Produces: Redesigned bill summary, tables, notification preferences, profile form with language segmented control, and sign-in cards.

- [ ] **Step 1: Run existing bill and profile tests to establish baseline**

Run: `npm test tests/domain/billActions.test.ts tests/domain/profilePage.test.ts`
Expected: PASS

- [ ] **Step 2: Restyle BillPage, BillTable, NotificationPrefs, PushSetup, ProfilePage, ProfileForm, LoginPage, LoginForm, PendingPage, and ExpiredPage**

Apply Calm Utility cards, fields, badges, buttons, and segmented language switcher to bill, profile, and auth pages.

- [ ] **Step 3: Run test suite to verify no regressions**

Run: `npm test tests/domain/billActions.test.ts tests/domain/profilePage.test.ts tests/domain/auth.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/bill/ src/app/profile/ src/app/login/ src/components/BillTable.tsx src/components/NotificationPrefs.tsx src/components/PushSetup.tsx src/components/ProfileForm.tsx src/components/LoginForm.tsx
git commit -m "feat: redesign bill, profile, and auth pages with calm utility system"
```

---

### Task 6: Admin Dashboard, Members & Money

**Files:**
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/members/page.tsx`
- Modify: `src/app/admin/money/page.tsx`
- Modify: `src/components/BalanceTable.tsx`
- Modify: `src/components/MoneySummary.tsx`
- Modify: `src/components/AddMemberForm.tsx`
- Modify: `src/components/AddMemberByEmailForm.tsx`
- Modify: `src/components/MemberEditForm.tsx`
- Modify: `src/components/MemberActions.tsx`
- Modify: `src/components/PaymentForm.tsx`
- Modify: `src/components/CreateNextMatchForm.tsx`
- Modify: `src/components/CopyMessage.tsx`
- Modify: `src/components/InviteLink.tsx`

**Interfaces:**
- Consumes: Primitives, admin actions, billing summaries
- Produces: Redesigned admin dashboard stats, responsive member cards replacing wide tables, money summary and balance cards.

- [ ] **Step 1: Run admin tests to establish baseline**

Run: `npm test tests/domain/adminActions.test.ts tests/domain/adminMembers.test.ts tests/domain/moneyActions.test.ts`
Expected: PASS

- [ ] **Step 2: Restyle AdminDashboard, AdminMembers, AdminMoney, BalanceTable, MoneySummary, and member/payment forms**

Replace wide tables with responsive card lists (`Card`, `Stat`, `Badge`, `Button`, `Field`).

- [ ] **Step 3: Run admin test suite**

Run: `npm test tests/domain/adminActions.test.ts tests/domain/adminMembers.test.ts tests/domain/moneyActions.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/members/page.tsx src/app/admin/money/page.tsx src/components/BalanceTable.tsx src/components/MoneySummary.tsx src/components/AddMemberForm.tsx src/components/AddMemberByEmailForm.tsx src/components/MemberEditForm.tsx src/components/MemberActions.tsx src/components/PaymentForm.tsx src/components/CreateNextMatchForm.tsx src/components/CopyMessage.tsx src/components/InviteLink.tsx
git commit -m "feat: redesign admin dashboard, members, and money pages"
```

---

### Task 7: Admin Match Detail (Roster, Attendance, Guests & Cancel)

**Files:**
- Modify: `src/app/admin/matches/[id]/page.tsx`
- Modify: `src/components/AdminRoster.tsx`
- Modify: `src/components/AttendanceList.tsx`
- Modify: `src/components/GuestPayments.tsx`
- Modify: `src/components/CancelMatchForm.tsx`
- Modify: `src/components/EditMatchForm.tsx`

**Interfaces:**
- Consumes: Primitives, match views, admin match actions
- Produces: Redesigned match detail view, roster management cards, 3-way attendance display, guest payment history cards, and cancel match form.

- [ ] **Step 1: Run admin match action tests to establish baseline**

Run: `npm test tests/domain/adminMatchActions.test.ts tests/domain/matchEdits.test.ts`
Expected: PASS

- [ ] **Step 2: Restyle AdminMatchPage, AdminRoster, AttendanceList, GuestPayments, CancelMatchForm, and EditMatchForm**

Apply cards, badges, fields, and buttons to match detail screens.

- [ ] **Step 3: Run test suite**

Run: `npm test tests/domain/adminMatchActions.test.ts tests/domain/matchEdits.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/matches/[id]/page.tsx src/components/AdminRoster.tsx src/components/AttendanceList.tsx src/components/GuestPayments.tsx src/components/CancelMatchForm.tsx src/components/EditMatchForm.tsx
git commit -m "feat: redesign admin match detail, roster, attendance, and guest payments"
```

---

### Task 8: Admin Settings, Audit, Not-Found & PWA Chrome

**Files:**
- Modify: `src/app/admin/settings/page.tsx`
- Modify: `src/app/admin/audit/page.tsx`
- Modify: `src/app/[...rest]/page.tsx`
- Create: `src/app/not-found.tsx`
- Modify: `src/app/manifest.ts`
- Modify: `src/components/SettingsForm.tsx`

**Interfaces:**
- Consumes: Primitives, audit domain helpers, manifest config
- Produces: Redesigned settings form, audit log cards, 404 not-found page, updated PWA manifest and viewport theme colors.

- [ ] **Step 1: Run settings and audit tests**

Run: `npm test tests/domain/settings.test.ts`
Expected: PASS

- [ ] **Step 2: Restyle AdminSettings, SettingsForm, AdminAudit, create `src/app/not-found.tsx`, and update `manifest.ts`**

Apply Calm Utility primitives to settings and audit. Add nice `not-found.tsx`. Update PWA manifest and theme colors.

- [ ] **Step 3: Run test suite**

Run: `npm test tests/domain/settings.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/settings/page.tsx src/app/admin/audit/page.tsx src/app/[...rest]/page.tsx src/app/not-found.tsx src/app/manifest.ts src/components/SettingsForm.tsx
git commit -m "feat: redesign admin settings, audit log, not-found page, and pwa manifest"
```

---

### Task 9: Final Verification & Test Suite

**Files:**
- None (verification task)

**Interfaces:**
- Consumes: Whole codebase and test suite
- Produces: Verified build, all tests passing, zero lint errors.

- [ ] **Step 1: Run full automated test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: Zero lint errors

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: Successful build (`.next` compiled)

- [ ] **Step 4: Commit final verification**

```bash
git commit --allow-empty -m "chore: verified full test suite, lint, and build for mobile-first redesign"
```
