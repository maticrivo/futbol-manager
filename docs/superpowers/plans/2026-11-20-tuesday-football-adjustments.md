# Tuesday Football Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the app to "Tuesday Football", default venue to Onim (אונים) with Google Maps link, kickoff time to Tuesday 20:00, and give admins a way to open signups immediately.

**Architecture:**
- Update `DEFAULT_SETTINGS` in `src/domain/settings.ts` to use venue `"Onim (אונים)"` with its Google Maps URL and kickoff time `"20:00"`.
- Update `src/lib/time.ts` or match creation routines so kickoff is Tuesday 20:00.
- Update app metadata, layout, manifest, and translation dictionaries (`messages/{en,he,es}.json`) from "Weekly Football" to "Tuesday Football".
- Add `openSignupsNow` action / domain helper to set `signupOpensAt = now` immediately.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM + MySQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-tuesday-football-adjustments-design.md`

## Global Constraints
- Integer agorot for money, request locale for copy, RTL-aware.
- Real MySQL tests; never mock SQL.
- Strict authorization (`requireAdmin`).

## Review Focus
1. **Early Signup Override**: Admin action successfully sets `signupOpensAt` to the current time, allowing immediate signups regardless of the Friday schedule.
2. **Default Venue & Time**: Newly created matches pick up "Onim (אונים)" with the Google Maps link and 20:00 kickoff time.
3. **Branding Consistency**: All mentions of "Weekly Football" updated to "Tuesday Football" across all three locales.

---

## Tasks

### Task 1: Rebrand to "Tuesday Football" and Default Venue/Time Settings
**Files:**
- Modify: `src/domain/settings.ts`, `src/lib/time.ts`, `src/app/manifest.ts`, `src/app/layout.tsx`, `messages/en.json`, `messages/he.json`, `messages/es.json`
- Test: `tests/domain/settings.test.ts`

**Interfaces:**
- Produces: Updated `DEFAULT_SETTINGS` with venue `"Onim (אונים)"` (and maps URL) and kickoff `"20:00"`, plus "Tuesday Football" copy.

- [x] **Step 1: Update `DEFAULT_SETTINGS` and `weekSchedule` in `src/domain/settings.ts` and `src/lib/time.ts`**
- [x] **Step 2: Update manifest, layout metadata, and i18n dictionaries for "Tuesday Football"**
- [x] **Step 3: Run tests (`npm test`) and typecheck (`npx tsc --noEmit`)**

---

### Task 2: Admin Early Signup Action
**Files:**
- Modify: `src/domain/matches.ts`, `src/app/actions/admin.ts`, `src/app/admin/matches/[id]/page.tsx`, `src/components/EditMatchForm.tsx`
- Test: `tests/domain/matchEdits.test.ts`

**Interfaces:**
- Produces: `openSignupsNow(db, { actorId, matchId, now })` and `openSignupsNowAction`.

- [ ] **Step 1: Write failing test for opening signups immediately in `tests/domain/matchEdits.test.ts`**
- [ ] **Step 2: Implement `openSignupsNow` and `openSignupsNowAction`**
- [ ] **Step 3: Add "Open signups now" button to match detail admin view and update tests**
- [ ] **Step 4: Run full test suite, build, and lint**
