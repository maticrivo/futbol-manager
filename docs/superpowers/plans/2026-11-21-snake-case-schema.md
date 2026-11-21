# Database Naming Convention Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor all database tables to plural `snake_case` and all database columns/fields to singular `snake_case`.

**Architecture:** We update `src/db/schema.ts` to define tables as plural `snake_case` and columns as singular `snake_case` using Drizzle ORM naming helpers (`mysqlTable('matches', { matchDate: char('match_date', ...) })` -> `mysqlTable('matches', { match_date: char('match_date', ...) })` or mapping via property names and database field names). Wait, in Drizzle ORM, table/column object property names can remain JS-friendly (camelCase) while mapped to database names (`snake_case`), OR both property names and DB names can be singular snake_case. The user specified: "lets make it a rule to have tables to be plural with snake_case and all fields to be singular with snake_case". That means both database names and JS property naming convention should be snake_case (e.g., `match_date`), or at least database names are plural snake_case / singular snake_case. Let's make JS property names and DB column names singular snake_case matching the rule.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM, MySQL 8, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-21-snake-case-schema-design.md`

## Global Constraints

- Tables plural `snake_case`.
- Fields/columns singular `snake_case`.
- Existing data ignored.
- All tests passing after refactoring.

## Review Focus

1. **Foreign key reference integrity:** All foreign keys correctly reference plural snake_case tables and singular snake_case primary keys. (*Pinned to Task 1 in `tests/db/schema.test.ts`*).
2. **Drizzle query property mapping:** All domain queries and inserts use the new singular snake_case field names. (*Pinned to Tasks 2-5*).
3. **Seed script functionality:** `scripts/seed.ts` successfully seeds initial data with the new schema names. (*Pinned to Task 6*).

---

### Task 1: Schema Refactoring & Migrations

**Files:**
- Modify: `src/db/schema.ts`
- Create/Modify: `drizzle/` migrations

- [ ] **Step 1: Update `src/db/schema.ts` for plural snake_case tables and singular snake_case fields**
- [ ] **Step 2: Generate Drizzle migration and run tests**
- [ ] **Step 3: Commit**

---

### Task 2: Domain Logic Refactoring (Matches, Entries, Members)

**Files:**
- Modify: `src/domain/matches.ts`, `src/domain/entries.ts`, `src/domain/members.ts`, `src/domain/queue.ts`, `src/domain/lock.ts`, `src/domain/matchView.ts`
- Test: corresponding domain tests

- [ ] **Step 1: Update domain queries and property accesses**
- [ ] **Step 2: Run tests and verify PASS**
- [ ] **Step 3: Commit**

---

### Task 3: Domain Logic Refactoring (Billing, Charges, Payments, Audit)

**Files:**
- Modify: `src/domain/billing.ts`, `src/domain/charges.ts`, `src/domain/allocations.ts`, `src/domain/audit.ts`, `src/domain/notifications.ts`, `src/domain/settings.ts`, `src/domain/tick.ts`, `src/domain/sessions.ts`

- [ ] **Step 1: Update billing/audit/charges queries and properties**
- [ ] **Step 2: Run tests and verify PASS**
- [ ] **Step 3: Commit**

---

### Task 4: Server Actions & Lib

**Files:**
- Modify: `src/app/actions/` (`admin.ts`, `auth.ts`, `bill.ts`, `match.ts`, `profile.ts`), `src/lib/`

- [ ] **Step 1: Update actions and lib references**
- [ ] **Step 2: Run tests and verify PASS**
- [ ] **Step 3: Commit**

---

### Task 5: Seed Script & Final Verification

**Files:**
- Modify: `scripts/seed.ts`

- [ ] **Step 1: Update `scripts/seed.ts`**
- [ ] **Step 2: Run `npm run seed`, `npm test`, `npm run lint`, `npm run build`**
- [ ] **Step 3: Commit**
