# Extended Member Profile Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every member `email`, `phone`, `name`, `nickname`, and `image` profile fields that they can set when requesting access and edit from their own profile, and that admins can always edit for any member.

**Architecture:**
- Today email is stored in `members.name` and is the login identity. Add dedicated nullable columns `email` (unique, 254), `phone` (40), `nickname` (60), `image` (500), backfill `email` from email-looking `name` values, and make all future lookups use `members.email`.
- Keep `createMember(db, input)` backwards compatible (tests rely on `{ name }` only) and add optional profile fields.
- Keep `requestMemberAccess(db, email, now?, profile?)` backwards compatible so existing positional test calls keep working; profile fields are applied only when the member row is first created.
- Add `updateMemberProfile(db, { actorId, memberId, patch })` that allows an admin to edit anyone, or a member to edit themselves. Role/status are never part of the patch.
- UI: optional fields in the `/login` request form, an admin "Edit details" form per member row, and a `/profile` page for members.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM + MySQL, Vitest, next-intl.

**Spec:** `docs/superpowers/specs/2026-11-21-extended-member-profile-fields-design.md`

## Global Constraints
- Real MySQL tests; never mock SQL.
- Strict authorization: `requireAdmin()` for admin actions, `requireMember()` for own-profile actions.
- Members must never be able to change `role` or `status` through profile editing.
- SQL identifiers use `camelCase` column names (existing convention). Store email lowercased.
- Money is unrelated here; do not touch billing code.
- Every new user-facing string is added to `messages/en.json`, `messages/he.json`, and `messages/es.json` (Hebrew RTL-safe markup, use logical CSS properties such as `text-start`, `ms-*`).
- Migrations are forward-only. Do not edit an already-applied migration; add a new one.

## Review Focus
1. **Admin Edits**: an admin can update any member's name, nickname, email, phone, and image URL from `/admin/members`.
2. **Registration & Self-Service**: a first-time requester can supply name/nickname/phone/image with their email, and a signed-in member can edit those fields at `/profile`.
3. **Identity Integrity**: email remains the unique login identity; blank optional fields are stored as `NULL`, never `''`; duplicate emails are rejected.

---

## Tasks

### Task 1: Schema, migration, and backfill for profile fields
**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0002_*.sql` via `npx drizzle-kit generate`
- Modify: `tests/db/schema.test.ts`

**Interfaces:**
- `members` gains: `email: string | null`, `phone: string | null`, `nickname: string | null`, `image: string | null`.
- `Member` (`typeof members.$inferSelect`) exposes the new fields automatically.

- [ ] Add the four columns to `members`:
  - `email: varchar('email', { length: 254 })` (nullable) with a unique index.
  - `phone: varchar('phone', { length: 40 })`
  - `nickname: varchar('nickname', { length: 60 })`
  - `image: varchar('image', { length: 500 })`
- [ ] Run `npx drizzle-kit generate`, then hand-edit the generated SQL so it runs, in this order: add columns → `UPDATE members SET email = LOWER(name) WHERE email IS NULL AND name LIKE '%@%';` → create the unique email index.
- [ ] Confirm `npx drizzle-kit generate` afterwards reports no further schema changes.
- [ ] Add a real-MySQL test in `tests/db/schema.test.ts` proving all four fields round-trip and that a duplicate non-null email is rejected.
- [ ] Run `npm test` and `npx tsc --noEmit`; commit `feat: add member profile columns and backfill emails`.

---

### Task 2: Domain helpers, registration profile input, and server actions
**Files:**
- Modify: `src/domain/members.ts`
- Modify: `src/app/actions/auth.ts`
- Modify: `src/app/actions/admin.ts`
- Create: `src/app/actions/profile.ts`
- Test: `tests/domain/memberProfile.test.ts`

**Interfaces:**
- `createMember(db, input: { name: string; role?; locale?; status?; email?: string | null; phone?: string | null; nickname?: string | null; image?: string | null })`
- `requestMemberAccess(db, email: string, now?: Date, profile?: { name?: string; nickname?: string; phone?: string; image?: string })`
- `updateMemberProfile(db, input: { actorId: number; memberId: number; patch: MemberProfilePatch }, now?: Date): Promise<Result<Member, 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_NAME' | 'INVALID_EMAIL' | 'INVALID_PHONE' | 'INVALID_IMAGE' | 'EMAIL_TAKEN'>>`
- `MemberProfilePatch = { name?: string; email?: string | null; phone?: string | null; nickname?: string | null; image?: string | null }`

Rules to implement exactly:
- Normalize email with `trim().toLowerCase()`; blank string means `null`.
- Name: trimmed, required, 1–120 chars. When creating from `requestMemberAccess`, default to the email local part if no name supplied.
- Nickname: trimmed, ≤ 60, blank → `null`.
- Phone: trimmed, ≤ 40, blank → `null`, allow only digits, spaces, `+`, `-`, `(`, `)` (reject letters) with at least 5 digits.
- Image: trimmed, ≤ 500, blank → `null`, must start with `http://` or `https://`.
- `requestMemberAccess` lookup order: `members.email = normalizedEmail`, then legacy `members.name = normalizedEmail` / `members.name = trimmedEmail`. Never overwrite an existing member's profile when they request a link.
- `updateMemberProfile` must lock rows in the established global order (member rows ascending by id, `FOR UPDATE`), verify the actor is an admin **or** the target member themselves, reject duplicate emails with `EMAIL_TAKEN`, write an audit entry `member.profile_update` with only changed field names (never values), and return the updated row.
- Never place `role`, `status`, `locale`, or `password`-like fields into the patch.
- `requestMagicLinkAction` reads optional `name`, `nickname`, `phone`, `image` fields and forwards them as the profile argument.
- `updateMemberAction` (admin, in `admin.ts`) and `updateOwnProfileAction` (in new `profile.ts`, uses `requireMember`) both parse form fields and call `updateMemberProfile`; return `ActionResult` and revalidate `/admin/members`, `/profile`, `/`.
- Add `errors.INVALID_PHONE`, `errors.INVALID_IMAGE`, `errors.EMAIL_TAKEN`, `errors.INVALID_NAME` copy in all three locales if missing.

- [ ] Write failing real-MySQL tests in `tests/domain/memberProfile.test.ts` covering: admin edits any member; member edits self; member cannot edit another member (`FORBIDDEN`); duplicate email (`EMAIL_TAKEN`); blank optional fields become `null`; invalid phone/image/email rejected; legacy lookup by `name` still finds the member and does not overwrite their name.
- [ ] Implement the domain changes and actions until tests pass.
- [ ] Run `npm test`, `npx tsc --noEmit`, `npm run lint`; commit `feat: add member profile domain helpers and actions`.

---

### Task 3: Admin member editing UI
**Files:**
- Modify: `src/app/admin/members/page.tsx`
- Create: `src/components/MemberEditForm.tsx`
- Modify: `messages/{en,he,es}.json`
- Test: reuse `tests/domain/memberProfile.test.ts` (domain-level) — no new component test required.

**Interfaces:**
- `MemberEditForm({ member }: { member: Member })` — client component using `useActionState(updateMemberAction, null)`.
- Fields: name (required), nickname, email, phone, image URL. Submit button + inline error/success text.

- [ ] Add columns for email, phone, and nickname (nickname rendered under the name) to the members table, keeping it horizontally scrollable on mobile.
- [ ] Render `MemberEditForm` inside a per-row `<details>` labelled "Edit details" so the table stays compact; prefill all fields from the row and clear focus behavior must not break the table.
- [ ] Add i18n keys for the new labels/buttons/success message in all three locales.
- [ ] Run `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run lint`; commit `feat: add admin member profile editing UI`.

---

### Task 4: Registration profile fields and member `/profile` page
**Files:**
- Modify: `src/components/LoginForm.tsx`
- Create: `src/app/profile/page.tsx`
- Create: `src/components/ProfileForm.tsx`
- Modify: `src/components/Nav.tsx`
- Modify: `messages/{en,he,es}.json`

**Interfaces:**
- `/profile` is a server component: `requireMember()`, load the fresh member row from the DB, render `ProfileForm` with current values.
- `ProfileForm` posts to `updateOwnProfileAction` and shows a localized success message.

- [ ] Extend `LoginForm` with an optional `<details>` group ("Add your details (optional)") containing name, nickname, phone, and image URL inputs; keep the email field and submit behavior unchanged.
- [ ] Add `/profile` with the same fields (email, name, nickname, phone, image) prefilled, plus a link to it in `Nav` for active members.
- [ ] Add all new strings to `messages/en.json`, `messages/he.json`, `messages/es.json`.
- [ ] Run `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run lint`; commit `feat: add registration profile fields and member profile page`.
