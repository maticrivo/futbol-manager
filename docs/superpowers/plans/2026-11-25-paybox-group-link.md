# Paybox Group Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin configure a Paybox group URL and show a "Pay on Paybox" button on the bill page whenever a member owes money.

**Architecture:** A new optional `payboxUrl` setting flows through the existing settings domain, admin action, and settings form. The bill page reads it and renders an external link button conditionally; notifications are untouched because they already open `/bill`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Drizzle ORM/Postgres, next-intl (he/en/es), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-paybox-group-link-design.md`

## Global Constraints

- One shared group link, not per-member links.
- Optional value: empty string means "not configured"; no button when empty.
- Only `http://` or `https://` URLs are accepted (`isHttpUrl`), max 500 characters.
- No Paybox API integration, no automatic payment reconciliation.
- Button appears only when `bill.dueAgorot > 0`.
- Copy in Hebrew, English, and Spanish.
- No database migration; `settings` is key/value.

## Review Focus

- A member with a credit or a settled month must not see a Pay button (test in Task 3).
- An unset or cleared link must render no anchor at all, not `href=""` (tests in Tasks 1 and 3).
- `javascript:`, `ftp:`, or malformed values must be rejected and never reach an `href` (test in Task 1).
- A saved link with surrounding whitespace must render trimmed (test in Task 2).
- Oversized (>500 chars) links must be rejected without disturbing the previous value (test in Task 1).

---

### Task 1: `payboxUrl` in the settings domain

**Files:**
- Modify: `src/domain/settings.ts`
- Modify: `tests/domain/settings.test.ts`
- Modify: `tests/domain/matches.test.ts:19-28`

**Interfaces:**
- Consumes: existing `Settings`, `getSettings`, `updateSettings`, `isHttpUrl`.
- Produces: `Settings.payboxUrl: string`; `DEFAULT_SETTINGS.payboxUrl === ''`; `getSettings` returns a stored value or `''`; `updateSettings` accepts an empty or valid HTTP(S) URL up to 500 chars and returns `INVALID_SETTING` otherwise.

- [ ] **Step 1: Write the failing tests**

In `tests/domain/settings.test.ts`, add `payboxUrl: ''` to the exact default expectation. In `tests/domain/matches.test.ts`, add `payboxUrl: ''` to the documented-defaults expectation. Then add:

```ts
it('stores a valid Paybox group link and rejects unsafe links', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member

  expect(await updateSettings(testDb, admin.id, { payboxUrl: 'https://link.payboxapp.com/group' }))
    .toMatchObject({ ok: true })
  expect((await getSettings(testDb)).payboxUrl).toBe('https://link.payboxapp.com/group')

  for (const bad of ['javascript:alert(1)', 'ftp://example.com/group', 'not-a-url', `https://example.com/${'a'.repeat(500)}`]) {
    expect(await updateSettings(testDb, admin.id, { payboxUrl: bad })).toEqual({ ok: false, code: 'INVALID_SETTING' })
  }
  expect((await getSettings(testDb)).payboxUrl).toBe('https://link.payboxapp.com/group')

  expect(await updateSettings(testDb, admin.id, { payboxUrl: '' })).toMatchObject({ ok: true })
  expect((await getSettings(testDb)).payboxUrl).toBe('')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/settings.test.ts tests/domain/matches.test.ts`
Expected: FAIL — defaults no longer match and `payboxUrl` is not a valid setting.

- [ ] **Step 3: Implement in `src/domain/settings.ts`**

- Add `payboxUrl: string` to `Settings`.
- Add `payboxUrl: ''` to `DEFAULT_SETTINGS`.
- Add `'payboxUrl'` to `VALID_SETTING_KEYS`.
- In `getSettings`, read `map.get('payboxUrl') ?? DEFAULT_SETTINGS.payboxUrl` into the returned object.
- In `updateSettings`, validate before the transaction:

```ts
if (patch.payboxUrl !== undefined) {
  if (typeof patch.payboxUrl !== 'string' || patch.payboxUrl.length > 500 ||
      (patch.payboxUrl !== '' && !isHttpUrl(patch.payboxUrl))) {
    return err('INVALID_SETTING')
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/domain/settings.test.ts tests/domain/matches.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/settings.ts tests/domain/settings.test.ts tests/domain/matches.test.ts
git commit -m "feat: add Paybox group link setting"
```

---

### Task 2: Admin settings field and server action

**Files:**
- Modify: `src/app/actions/admin.ts:241-246` (after the `venueUrl` block)
- Modify: `src/app/admin/settings/page.tsx:20-29`
- Modify: `src/components/SettingsForm.tsx`
- Modify: `messages/he.json:308-320`, `messages/en.json:308-320`, `messages/es.json:308-320`
- Test: `tests/domain/adminActions.test.ts`

**Interfaces:**
- Consumes: `Settings.payboxUrl` from Task 1.
- Produces: `updateSettingsAction` persists a trimmed `payboxUrl` or returns `INVALID_SETTING`; `SettingsForm` accepts a required `payboxUrl: string` prop and emits an input named `payboxUrl`.

- [ ] **Step 1: Write the failing test**

Add `data.set('payboxUrl', '')` to the `settingsForm()` helper in `tests/domain/adminActions.test.ts`, then add:

```ts
it('updateSettingsAction saves a trimmed Paybox group link and rejects unsafe values', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await updateSettingsAction(null, settingsForm({ payboxUrl: '  https://link.payboxapp.com/group  ' })))
    .toEqual({ ok: true })
  expect((await getSettings(testDb)).payboxUrl).toBe('https://link.payboxapp.com/group')

  expect(await updateSettingsAction(null, settingsForm({ payboxUrl: 'javascript:alert(1)' })))
    .toEqual({ ok: false, code: 'INVALID_SETTING' })
  expect((await getSettings(testDb)).payboxUrl).toBe('https://link.payboxapp.com/group')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/domain/adminActions.test.ts`
Expected: FAIL — the link is not persisted.

- [ ] **Step 3: Implement the action and UI wiring**

In `updateSettingsAction`, after the `venueUrl` block, mirror it:

```ts
const payboxUrlValue = formData.get('payboxUrl')
const payboxUrl = typeof payboxUrlValue === 'string' ? payboxUrlValue.trim() : ''
if (payboxUrl !== '' && (payboxUrl.length > 500 || !isHttpUrl(payboxUrl))) {
  return { ok: false, code: 'INVALID_SETTING' }
}
patch.payboxUrl = payboxUrl
```

Pass `payboxUrl={settings.payboxUrl}` in `src/app/admin/settings/page.tsx`. Add a `payboxUrl: string` prop to `SettingsForm` and, after the venue-URL field, an equivalent field:

```tsx
<Field label={t('admin.settings.payboxUrl')} hint={t('admin.settings.payboxUrlHint')}>
  <input
    name="payboxUrl"
    type="url"
    inputMode="url"
    dir="ltr"
    maxLength={500}
    defaultValue={payboxUrl}
    placeholder="https://link.payboxapp.com/..."
    className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-focus"
  />
</Field>
```

Add to `admin.settings` in each message file:

- he: `"payboxUrl": "קישור לקבוצת PayBox"`, `"payboxUrlHint": "קישור ההצטרפות לקבוצת PayBox שמופיע בחשבון החודשי (אופציונלי)."`
- en: `"payboxUrl": "Paybox group link"`, `"payboxUrlHint": "Paybox group invite link shown on members' bills (optional)."`
- es: `"payboxUrl": "Enlace del grupo de Paybox"`, `"payboxUrlHint": "Enlace de invitación al grupo de Paybox que se muestra en la cuenta de los miembros (opcional)."`

- [ ] **Step 4: Run checks**

Run: `npx vitest run tests/domain/adminActions.test.ts tests/domain/settings.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors (confirms the new required form prop is threaded through).

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/admin.ts src/app/admin/settings/page.tsx src/components/SettingsForm.tsx messages tests/domain/adminActions.test.ts
git commit -m "feat: configure Paybox link in admin settings"
```

---

### Task 3: "Pay on Paybox" button on the bill page

**Files:**
- Modify: `src/app/bill/page.tsx:17-58`
- Modify: `messages/he.json:146-165`, `messages/en.json:146-165`, `messages/es.json:146-165`
- Test: `tests/domain/billPage.test.ts` (create)

**Interfaces:**
- Consumes: `getSettings(db).payboxUrl` from Task 1; `Button` from `@/components/ui/Button` (`asChild` merges className into the anchor child).
- Produces: bill page markup containing `<a href="<payboxUrl>" target="_blank" rel="noopener noreferrer">` exactly when `bill.dueAgorot > 0` and `payboxUrl !== ''`.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/billPage.test.ts`:

```ts
import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { charges } from '@/db/schema'
import { createMatchForDate } from '@/domain/matches'
import { createMember } from '@/domain/members'
import { updateSettings } from '@/domain/settings'
import { requireMember } from '@/lib/auth'
import { billingMonthOf } from '@/lib/time'
import { testDb, resetDb } from '../db'

vi.mock('next-intl/server', () => {
  const t = Object.assign((key: string) => key, { rich: (key: string) => key })
  return { getTranslations: vi.fn(async () => t), getLocale: vi.fn(async () => 'en') }
})
vi.mock('@/lib/auth', () => ({ requireMember: vi.fn() }))
vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => testDb,
}))
vi.mock('@/components/BillTable', () => ({ default: () => null }))

import BillPage from '@/app/bill/page'

beforeEach(async () => {
  await resetDb()
  vi.clearAllMocks()
})

async function signInMember(chargeAgorot?: number) {
  const member = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com' })).member
  if (chargeAgorot !== undefined) {
    const month = billingMonthOf(new Date())
    const match = await createMatchForDate(testDb, `${month}-15`)
    await testDb.insert(charges).values({ matchId: match.id, memberId: member.id, billingMonth: month, amountAgorot: chargeAgorot })
  }
  vi.mocked(requireMember).mockResolvedValue({ ...member, locale: 'en' } as never)
}

async function configurePaybox() {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  await updateSettings(testDb, admin.id, { payboxUrl: 'https://link.payboxapp.com/group' })
}

it('shows the Paybox link when a balance is due and a link is configured', async () => {
  await signInMember(3500)
  await configurePaybox()

  const html = renderToStaticMarkup(await BillPage())

  expect(html).toContain('href="https://link.payboxapp.com/group"')
  expect(html).toContain('target="_blank"')
  expect(html).toContain('rel="noopener noreferrer"')
})

it('hides the Paybox link when nothing is due', async () => {
  await signInMember()
  await configurePaybox()

  const html = renderToStaticMarkup(await BillPage())

  expect(html).not.toContain('link.payboxapp.com')
})

it('hides the Paybox link when no link is configured', async () => {
  await signInMember(3500)

  const html = renderToStaticMarkup(await BillPage())

  expect(html).not.toContain('payOnPaybox')
  expect(html).not.toContain('href=""')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/domain/billPage.test.ts`
Expected: FAIL — no Paybox anchor is rendered.

- [ ] **Step 3: Implement the bill page**

In `src/app/bill/page.tsx`:

- Import `getSettings` from `@/domain/matches` and `Button` from `@/components/ui/Button`.
- Add `getSettings(db)` to the existing `Promise.all` and destructure it.
- Inside the due card, after the amount/balance row, add:

```tsx
{bill.dueAgorot > 0 && settings.payboxUrl !== '' && (
  <div className="pt-2">
    <Button asChild className="w-full sm:w-auto">
      <a href={settings.payboxUrl} target="_blank" rel="noopener noreferrer">
        {t('payOnPaybox')}
      </a>
    </Button>
  </div>
)}
```

Add `"payOnPaybox"` to each `bill` block:

- he: `"לתשלום בפייבוקס"`
- en: `"Pay on Paybox"`
- es: `"Pagar en Paybox"`

- [ ] **Step 4: Run checks**

Run: `npx vitest run tests/domain/billPage.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/bill/page.tsx messages tests/domain/billPage.test.ts
git commit -m "feat: add Pay on Paybox button to the bill"
```
