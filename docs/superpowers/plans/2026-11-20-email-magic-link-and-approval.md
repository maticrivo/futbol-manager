# Email Magic Links & Member Approval Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace invite tokens with self-service email magic links via Resend and introduce a `pending` state for new member sign-ups requiring admin approval.

**Architecture:** 
- Add `'pending'` to the `memberStatusEnum` in database schema.
- Implement a Resend email client (`src/lib/email.ts`) for magic link delivery.
- Create self-service sign-in/sign-up page (`/login`) allowing users to request a magic link by email.
- Update session authentication (`src/lib/auth.ts`, `src/app/login/[token]/route.ts`) to verify magic tokens, log users in, and redirect pending users to a pending notice screen instead of the main app.
- Update admin members page (`/admin/members`) to display pending members with Approve/Disable/Enable actions and allow manual email additions.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM + MySQL, Resend API, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-email-magic-link-and-approval-design.md`

## Global Constraints
- Integer agorot for money, request locale for copy, RTL-aware.
- Real MySQL tests; never mock SQL.
- Strict authorization (`requireAdmin`, `getCurrentMember`).

## Review Focus
1. **Unregistered Email Sign-up**: A user enters an unknown email on `/login`; a new member row is created with status `'pending'` and a magic link is sent.
2. **Pending Member Block**: A user with `status: 'pending'` who clicks their magic link logs in successfully but is intercepted by a pending notice and cannot join matches or view bills.
3. **Admin Approval**: An admin approves a pending member in `/admin/members`, moving their status to `active`, granting immediate full access on their next page load.
4. **Token Security**: Magic tokens are hashed (SHA-256) at rest, single-use or time-bound, and never logged or exposed in query params.

---

## Tasks

### Task 1: Database Schema & Migration for Member Status
**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/` migration or update schema definition

**Interfaces:**
- Produces: `memberStatusEnum` updated to `['pending', 'active', 'disabled']`.

- [ ] **Step 1: Update `memberStatusEnum` in `src/db/schema.ts` to include `'pending'`**
- [ ] **Step 2: Run test / migration check to verify schema validity**

---

### Task 2: Resend Email Integration & Domain Magic Links
**Files:**
- Create: `src/lib/email.ts`, `tests/domain/email.test.ts`
- Modify: `src/domain/members.ts`

**Interfaces:**
- Produces: `sendMagicLinkEmail(email: string, token: string): Promise<void>`, `requestMagicLink(db, email, now): Promise<Result<{ memberId: number; inviteToken: string }, 'INVALID_EMAIL'>>`

- [ ] **Step 1: Write failing test for magic link generation and email helper in `tests/domain/email.test.ts`**
- [ ] **Step 2: Implement `sendMagicLinkEmail` and `requestMagicLink`**
- [ ] **Step 3: Run tests and verify**

---

### Task 3: Pending Status Blocking & Login Route Update
**Files:**
- Modify: `src/lib/auth.ts`, `src/app/login/[token]/route.ts`, `src/app/page.tsx`
- Create: `src/app/login/pending/page.tsx`, `tests/domain/loginApproval.test.ts`

**Interfaces:**
- Produces: Pending status middleware / route interception directing pending users to `/login/pending`.

- [ ] **Step 1: Write failing tests for pending status blocking in `tests/domain/loginApproval.test.ts`**
- [ ] **Step 2: Update session handling to detect `pending` status and redirect/display pending notice**
- [ ] **Step 3: Implement `/login` request form and magic link handler**
- [ ] **Step 4: Run tests and verify**

---

### Task 4: Admin Approval & Member Management UI
**Files:**
- Modify: `src/app/admin/members/page.tsx`, `src/app/actions/admin.ts`, `src/components/MemberActions.tsx`
- Create: `src/components/AddMemberByEmailForm.tsx`

**Interfaces:**
- Produces: Admin ability to approve pending members, disable/enable members, and add members by email.

- [x] **Step 1: Add action for admin member approval (`setMemberStatusAction` supporting `'pending' | 'active' | 'disabled'`)**
- [x] **Step 2: Update `AdminMembers` page and `MemberActions` component to display pending status and Approve button**
- [x] **Step 3: Run build, tests, and lint**
