# Member Role Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins promote active members to admin and demote admins, with the `ADMIN_EMAIL` superuser immune to demotion.

**Architecture:** One audited domain function (`setMemberRole`) enforces all role rules inside a transaction with ascending user-id row locks; a thin server action wraps it. The member card in `/admin/members` renders the role controls and explanation notes. No schema change.

**Tech Stack:** Next.js 16 server actions, Drizzle ORM, Vitest, next-intl.

**Spec:** `docs/superpowers/specs/2026-11-25-member-role-management-design.md`

## Global Constraints

- Promotion is allowed only when the target's `status` is `active`; otherwise `MEMBER_NOT_ACTIVE`.
- The account whose email matches `ADMIN_EMAIL` can never be demoted, by anyone, including themselves (`FORBIDDEN`).
- An admin can never demote themselves (`FORBIDDEN`), matching the self-disable rule.
- Lock user rows with `.for('update')` in ascending text-id order, as `setMemberStatus` does.
- Audit action name is `member.role`, entity `member`, detail `{ role }`.
- Add every new user-facing string to all three locales: `messages/en.json`, `messages/he.json`, `messages/es.json`.
- No database migration and no changes to member status behavior.

## Review Focus

- **Superuser demotion through a crafted POST** (button hidden in UI): must return `FORBIDDEN`, and `ADMIN_EMAIL` matching must survive case and surrounding whitespace. Owned by Task 1, test “refuses to demote the configured superuser”.
- **Self-demotion through a crafted POST**: must return `FORBIDDEN` and leave the actor admin. Owned by Task 1, test “demotes another admin but not yourself”.
- **Promoting a pending or disabled member through a crafted POST**: must return `MEMBER_NOT_ACTIVE` and leave the role unchanged. Owned by Task 1, test “rejects promoting pending and disabled members”.
- **An actor demoted by someone else mid-session**: the domain re-reads the actor's role after locking, so their next role change returns `FORBIDDEN`. Owned by Task 1, same demotion test (direct domain call).
- **Malformed `memberId` or `role`**: must return `NOT_FOUND` with no role or audit change. Owned by Task 1, test “rejects malformed role changes”.

---

### Task 1: Server-side role changes

**Files:**
- Modify: `src/domain/members.ts`
- Modify: `src/app/actions/admin.ts`
- Modify: `tests/domain/adminActions.test.ts`

**Interfaces:**
- Consumes: `Db`, `users`, `Result`/`ok`/`err`, `writeAudit`, `asc`/`inArray`/`eq` (already imported in `src/domain/members.ts`); `isConfiguredAdminEmail` from `src/domain/oauth.ts`; `requireAdmin`, `parseUserId`, `ActionResult`, `revalidatePath` (already imported in `src/app/actions/admin.ts`).
- Produces:
  - `setMemberRole(db: Db, actorId: string, memberId: string, role: 'member' | 'admin'): Promise<Result<Member, 'FORBIDDEN' | 'NOT_FOUND' | 'MEMBER_NOT_ACTIVE'>>`
  - `setMemberRoleAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult>` — reads form fields `memberId` and `role` (`'admin' | 'member'`).

- [ ] **Step 1: Write the failing tests**

In `tests/domain/adminActions.test.ts`, add `afterEach` to the Vitest import, import `and, eq` from `drizzle-orm`, import `auditLog` alongside `matches` from `@/db/schema`, add `setMemberRoleAction` to the `@/app/actions/admin` import, and import `setMemberRole` from `@/domain/members`. Add module-level env handling next to the existing `beforeEach`:

```ts
const originalAdminEmail = process.env.ADMIN_EMAIL

beforeEach(async () => {
  vi.clearAllMocks()
  delete process.env.ADMIN_EMAIL
  await resetDb()
})

afterEach(() => {
  if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL
  else process.env.ADMIN_EMAIL = originalAdminEmail
})
```

(Replace the existing `beforeEach` block with this version.) Add a helper next to `statusForm`:

```ts
function roleForm(memberId: string, role: string) {
  const data = idForm(memberId)
  data.set('role', role)
  return data
}
```

Append these tests:

```ts
it('setMemberRoleAction promotes an active member and audits the change', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const target = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await setMemberRoleAction(null, roleForm(target.id, 'admin'))).toEqual({ ok: true })
  expect((await listMembers(testDb)).find((m) => m.id === target.id)!.role).toBe('admin')

  const audits = await testDb
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, 'member.role'), eq(auditLog.entityId, target.id)))
  expect(audits).toHaveLength(1)
  expect(audits[0].actorId).toBe(admin.id)
  expect(audits[0].detail).toEqual({ role: 'admin' })
  expect(revalidatePath).toHaveBeenCalledWith('/admin/members')
})

it('setMemberRoleAction rejects promoting pending and disabled members', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const pending = (await createMember(testDb, { name: 'Pending', email: 'pending@example.com', status: 'pending' })).member
  const disabled = (await createMember(testDb, { name: 'Off', email: 'off@example.com', status: 'disabled' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await setMemberRoleAction(null, roleForm(pending.id, 'admin'))).toEqual({ ok: false, code: 'MEMBER_NOT_ACTIVE' })
  expect(await setMemberRoleAction(null, roleForm(disabled.id, 'admin'))).toEqual({ ok: false, code: 'MEMBER_NOT_ACTIVE' })
  expect((await listMembers(testDb)).find((m) => m.id === pending.id)!.role).toBe('member')
  expect((await listMembers(testDb)).find((m) => m.id === disabled.id)!.role).toBe('member')
})

it('setMemberRoleAction demotes another admin but not yourself', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const other = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await setMemberRoleAction(null, roleForm(other.id, 'member'))).toEqual({ ok: true })
  expect((await listMembers(testDb)).find((m) => m.id === other.id)!.role).toBe('member')

  expect(await setMemberRoleAction(null, roleForm(admin.id, 'member'))).toEqual({ ok: false, code: 'FORBIDDEN' })
  expect((await listMembers(testDb)).find((m) => m.id === admin.id)!.role).toBe('admin')

  // The just-demoted admin cannot demote anyone else.
  expect(await setMemberRole(testDb, other.id, admin.id, 'member')).toEqual({ ok: false, code: 'FORBIDDEN' })
})

it('setMemberRoleAction refuses to demote the configured superuser', async () => {
  process.env.ADMIN_EMAIL = ' BOSS@Example.com '
  const superuser = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const other = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(other)

  expect(await setMemberRoleAction(null, roleForm(superuser.id, 'member'))).toEqual({ ok: false, code: 'FORBIDDEN' })
  expect((await listMembers(testDb)).find((m) => m.id === superuser.id)!.role).toBe('admin')

  // Regular promotions still work while ADMIN_EMAIL is set.
  const player = (await createMember(testDb, { name: 'Player', email: 'player@example.com' })).member
  expect(await setMemberRoleAction(null, roleForm(player.id, 'admin'))).toEqual({ ok: true })
})

it('setMemberRoleAction rejects malformed role changes', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const target = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await setMemberRoleAction(null, roleForm(target.id, 'owner'))).toEqual({ ok: false, code: 'NOT_FOUND' })
  expect(await setMemberRoleAction(null, idForm(target.id))).toEqual({ ok: false, code: 'NOT_FOUND' })
  expect(await setMemberRoleAction(null, roleForm('not-a-uuid', 'admin'))).toEqual({ ok: false, code: 'NOT_FOUND' })
  expect(await setMemberRoleAction(null, roleForm(crypto.randomUUID(), 'admin'))).toEqual({ ok: false, code: 'NOT_FOUND' })

  expect((await listMembers(testDb)).find((m) => m.id === target.id)!.role).toBe('member')
  expect(await testDb.select().from(auditLog).where(eq(auditLog.action, 'member.role'))).toHaveLength(0)
})

it('setMemberRoleAction rejects when the admin authorization check fails', async () => {
  const target = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com' })).member
  vi.mocked(requireAdmin).mockRejectedValueOnce(new Error('NEXT_REDIRECT'))

  await expect(setMemberRoleAction(null, roleForm(target.id, 'admin'))).rejects.toThrow('NEXT_REDIRECT')
  expect((await listMembers(testDb)).find((m) => m.id === target.id)!.role).toBe('member')
})

it('setMemberRoleAction treats an unchanged role as a no-op with no audit entry', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', email: 'boss@example.com', role: 'admin' })).member
  const target = (await createMember(testDb, { name: 'Ana', email: 'ana@example.com', role: 'admin' })).member
  vi.mocked(requireAdmin).mockResolvedValue(admin)

  expect(await setMemberRoleAction(null, roleForm(target.id, 'admin'))).toEqual({ ok: true })
  expect(await testDb.select().from(auditLog).where(eq(auditLog.action, 'member.role'))).toHaveLength(0)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/adminActions.test.ts`
Expected: FAIL — `setMemberRoleAction` / `setMemberRole` are not exported.

- [ ] **Step 3: Implement `setMemberRole` in `src/domain/members.ts`**

Add near `setMemberStatus`, with this exact signature and guard order:

1. `db.transaction`: compute `ids = Array.from(new Set([actorId, memberId])).sort()`, select from `users` with `inArray(users.id, ids).for('update').orderBy(asc(users.id))`.
2. `actor` missing or `actor.role !== 'admin'` → `err('FORBIDDEN')`.
3. `target` missing → `err('NOT_FOUND')`.
4. If `target.role === role`, return `ok(toMember(target))` immediately (no audit).
5. If `role === 'member'`: `actorId === memberId` → `err('FORBIDDEN')`; then `isConfiguredAdminEmail(target.email)` → `err('FORBIDDEN')`.
6. If `role === 'admin'` and `target.status !== 'active'` → `err('MEMBER_NOT_ACTIVE')`.
7. `tx.update(users).set({ role }).where(eq(users.id, memberId))`; `writeAudit(tx, { actorId, action: 'member.role', entity: 'member', entityId: memberId, detail: { role } })`; select the row and return `ok(toMember(updated!))`.

Import `isConfiguredAdminEmail` from `./oauth`. Both modules export function declarations, so the circular import resolves at call time.

- [ ] **Step 4: Implement `setMemberRoleAction` in `src/app/actions/admin.ts`**

Add `setMemberRole` to the existing `@/domain/members` import and append the action:

```ts
export async function setMemberRoleAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin()
  const db = getDb()

  const memberId = parseUserId(formData.get('memberId'))
  if (memberId === null) {
    return { ok: false, code: 'NOT_FOUND' }
  }

  const roleValue = formData.get('role')
  if (roleValue !== 'admin' && roleValue !== 'member') {
    return { ok: false, code: 'NOT_FOUND' }
  }

  const result = await setMemberRole(db, admin.id, memberId, roleValue)
  if (!result.ok) {
    return { ok: false, code: result.code }
  }

  revalidatePath('/admin/members')
  revalidatePath('/admin')
  revalidatePath('/')
  return { ok: true }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/domain/adminActions.test.ts`
Expected: PASS, including the pre-existing tests in the file.

- [ ] **Step 6: Commit**

```bash
git add src/domain/members.ts src/app/actions/admin.ts tests/domain/adminActions.test.ts
git commit -m "feat: add audited member role changes with superuser protection"
```

---

### Task 2: Admin member card controls and copy

**Files:**
- Modify: `src/app/admin/members/page.tsx`
- Modify: `src/components/MemberActions.tsx`
- Modify: `messages/en.json`, `messages/he.json`, `messages/es.json`

**Interfaces:**
- Consumes: `setMemberRoleAction` from Task 1; `isConfiguredAdminEmail` from `@/domain/oauth`; `role` field on `Member`.
- Produces: `MemberActions` props become `{ memberId: string; isSelf: boolean; status: 'active' | 'disabled' | 'pending'; role: 'member' | 'admin'; isSuperuser: boolean }`.

- [ ] **Step 1: Add translations**

Inside the `admin.members` object of each locale, add:

```json
"makeAdmin": "Make admin",
"removeAdmin": "Remove admin",
"roleSuperuser": "Superuser",
"selfRoleNote": "You can’t remove your own admin role",
"superuserNote": "Superuser — admin can’t be removed",
```

Hebrew (`messages/he.json`):

```json
"makeAdmin": "מינוי למנהל",
"removeAdmin": "הסרת הרשאת מנהל",
"roleSuperuser": "מנהל־על",
"selfRoleNote": "לא ניתן להסיר את הרשאת המנהל של עצמך",
"superuserNote": "מנהל־על — לא ניתן להסיר את הרשאת המנהל",
```

Spanish (`messages/es.json`):

```json
"makeAdmin": "Hacer administrador",
"removeAdmin": "Quitar administrador",
"roleSuperuser": "Superusuario",
"selfRoleNote": "No puedes quitarte tu propio rol de administrador",
"superuserNote": "Superusuario: no se puede quitar el rol de administrador",
```

Also add to the top-level `errors` object in each locale:

- en: `"MEMBER_NOT_ACTIVE": "Only active members can be made admins."`
- he: `"MEMBER_NOT_ACTIVE": "רק חברים פעילים יכולים להתמנות למנהלים."`
- es: `"MEMBER_NOT_ACTIVE": "Solo los miembros activos pueden ser administradores."`

- [ ] **Step 2: Update `src/app/admin/members/page.tsx`**

Import `isConfiguredAdminEmail` from `@/domain/oauth`. Inside the `members.map`, compute `const isSuperuser = isConfiguredAdminEmail(member.email)`. Change the role badge so it reads:

```tsx
{member.role === 'admin' ? (
  <Badge variant="primary" size="sm">
    {isSuperuser ? t('members.roleSuperuser') : t('members.roleAdmin')}
  </Badge>
) : (
  <Badge variant="secondary" size="sm">{t('members.roleMember')}</Badge>
)}
```

Pass the new props to `MemberActions`:

```tsx
<MemberActions
  memberId={member.id}
  isSelf={member.id === admin.id}
  status={member.status}
  role={member.role}
  isSuperuser={isSuperuser}
/>
```

- [ ] **Step 3: Update `src/components/MemberActions.tsx`**

Import `setMemberRoleAction` alongside `setMemberStatusAction`; add `role` and `isSuperuser` to the props type. Add a second action state:

```ts
const [roleState, roleAction] = useActionState(setMemberRoleAction, null)
```

After the existing status block, render the role controls:

```tsx
{role === 'admin' ? (
  isSuperuser ? (
    <span className="text-sm text-muted">{t('admin.members.superuserNote')}</span>
  ) : isSelf ? (
    <span className="text-sm text-muted">{t('admin.members.selfRoleNote')}</span>
  ) : (
    <form action={roleAction}>
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="role" value="member" />
      <SubmitButton
        label={t('admin.members.removeAdmin')}
        pendingLabel={t('admin.members.working')}
      />
    </form>
  )
) : status === 'active' ? (
  <form action={roleAction}>
    <input type="hidden" name="memberId" value={memberId} />
    <input type="hidden" name="role" value="admin" />
    <SubmitButton
      label={t('admin.members.makeAdmin')}
      pendingLabel={t('admin.members.working')}
    />
  </form>
) : null}
<ActionError code={roleState?.ok === false ? roleState.code : null} />
```

Keep the existing status buttons and their `ActionError` as they are.

- [ ] **Step 4: Type-check and run the full test suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Verify the build renders the page**

Run: `npm run build`
Expected: build succeeds with no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/members/page.tsx src/components/MemberActions.tsx messages/en.json messages/he.json messages/es.json
git commit -m "feat: add admin role controls to the member list"
```

---

## Manual verification (after Task 2)

- Open `/admin/members` as an admin. An active member shows “Make admin”; after promoting, the card shows the Admin badge and “Remove admin”.
- Your own admin card shows “You can’t remove your own admin role”.
- The `ADMIN_EMAIL` account shows the Superuser badge and “Superuser — admin can’t be removed”.
- A pending or disabled member shows no “Make admin” button.
- Promote a second admin, have them open `/admin/members`, demote them from your account, and confirm their next `/admin` request redirects home.
