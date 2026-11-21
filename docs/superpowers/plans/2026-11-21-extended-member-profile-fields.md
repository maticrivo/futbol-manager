# Extended Member Profile Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `email`, `phone`, `image`, and `nickname` to member profiles so members and admins can set and edit them.

**Architecture:**
- Add nullable columns (`email`, `phone`, `image`, `nickname`) to the `members` table schema and generate/apply a Drizzle migration.
- Update `createMember`, `requestMemberAccess`, and admin actions (`addMemberAction`, `setMemberStatusAction`, or a new `updateMemberAction`) to support these fields.
- Update UI components (`AdminMembers`, member tables/forms, and a new or updated member profile/settings view) to display and edit email, phone, name, image, and nickname.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM + MySQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-21-extended-member-profile-fields-design.md`

## Global Constraints
- Real MySQL tests; never mock SQL.
- Strict authorization (`requireAdmin`, `requireMember`).
- RTL-aware, localized strings.

## Review Focus
1. **Admin Edits**: Admins can update any member's email, phone, name, image, and nickname from `/admin/members`.
2. **Member Fields Persistence**: New profile fields correctly save and persist in MySQL.

---

## Tasks

### Task 1: Database Schema & Migration for Profile Fields
**Files:**
- Modify: `src/db/schema.ts`
- Create: Drizzle migration file in `drizzle/`

**Interfaces:**
- Produces: `members` table with `email`, `phone`, `image`, `nickname` columns.

- [ ] **Step 1: Add `email`, `phone`, `image`, `nickname` columns to `members` in `src/db/schema.ts`**
- [ ] **Step 2: Generate Drizzle migration and verify schema with DB integration tests**

---

### Task 2: Domain Helpers & Admin Actions for Profile Fields
**Files:**
- Modify: `src/domain/members.ts`, `src/app/actions/admin.ts`
- Test: `tests/domain/adminMembers.test.ts`

**Interfaces:**
- Produces: `updateMember(db, { actorId, memberId, patch })` and `updateMemberAction`.

- [ ] **Step 1: Write failing test for updating member profile fields in `tests/domain/adminMembers.test.ts`**
- [ ] **Step 2: Implement `updateMember` and `updateMemberAction`**
- [ ] **Step 3: Run tests and verify**

---

### Task 3: Admin UI & Profile Management Updates
**Files:**
- Modify: `src/app/admin/members/page.tsx`, `src/components/MemberActions.tsx`, `messages/en.json`, `messages/he.json`, `messages/es.json`
- Create: `src/components/EditMemberModal.tsx` or inline edit form

**Interfaces:**
- Produces: Admin interface to view and edit email, phone, image, nickname for members.

- [ ] **Step 1: Update admin members table and form to support email, phone, image, and nickname**
- [ ] **Step 2: Run full test suite, build, and lint**
