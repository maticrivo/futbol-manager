# Signup Push at the Actual Signup Time — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send the `signup_open` push when a match actually starts accepting signups, and move the default signup-open time from Friday 00:00 to Friday 09:00 Jerusalem time.

**Architecture:** `weekSchedule` in `src/lib/time.ts` owns the default weekly timestamps. `processDueNotifications` in `src/domain/notifications.ts` decides which notification windows are due. This change makes the signup window start at `signupOpensAt` exactly and shifts the default `signupOpensAt` to 09:00, so the push and the open signup state stay together. The existing 30-minute window and `notification_logs` dedupe are unchanged.

**Tech Stack:** Next.js 16, TypeScript, Luxon, Drizzle ORM, Vitest, `web-push`.

**Spec:** `docs/superpowers/specs/2026-11-27-signup-push-at-open-design.md`

## Global Constraints

- All schedule calculations use `Asia/Jerusalem` (`TZ` in `src/lib/time.ts`).
- Default `signupOpensAt` is Friday 09:00 Jerusalem time, four days before the match.
- `signup_open` is due from `signupOpensAt` through `signupOpensAt + 30 minutes`, inclusive.
- Each `(eventKey, memberId)` pair is sent at most once via `notification_logs`.
- Do not change `guest_phase`, `lock_reminder`, `queue_offer`, `bill_ready`, or `payment_reminder` timings.
- Do not change the push transport, VAPID configuration, or subscription handling.
- The scheduler cadence remains every 10 minutes.

## Review Focus

- **Spring DST Friday:** 09:00 Jerusalem is `06:00Z`, not `07:00Z`; a UTC arithmetic shortcut would shift the push an hour late.
- **Autumn DST Friday:** 09:00 Jerusalem is `06:00Z` in late October; the other DST boundary must still resolve to 09:00 local.
- **Custom signup time and manual opens:** changing `signupOpensAt` or using **Open signups now** must move the push to that instant, not nine hours later.
- **No early push:** a tick one minute before `signupOpensAt` must send nothing for `signup_open`.
- **Window boundaries and dedupe:** ticks at the start and at start + 30 minutes both qualify, and concurrent ticks send once.

---

### Task 1: Make the signup push follow the configured signup time

**Files:**
- Modify: `src/lib/time.ts` (the `signupOpensAt` calculation around line 18)
- Modify: `src/domain/notifications.ts` (the `signup_open` window around line 148)
- Modify: `tests/unit/time.test.ts`
- Modify: `tests/domain/matchView.test.ts`
- Modify: `tests/domain/tick.test.ts`
- Modify: `tests/domain/notifications.test.ts`
- Modify: `tests/helpers/fixtures.ts`
- Modify: `docs/superpowers/specs/2026-11-18-weekly-football-manager-design.md`
- Modify: `docs/superpowers/specs/2026-11-20-tuesday-football-adjustments-design.md`

**Interfaces:**
- Consumes: `weekSchedule(matchDate: string, kickoffTime?: string): { kickoffAt: Date; signupOpensAt: Date; guestPhaseAt: Date; lockAt: Date }` and `processDueNotifications(db: Db, now: Date, transport: PushTransport): Promise<{ sent: number }>`.
- Produces: no signature changes; only the `signupOpensAt` value and the `signup_open` window start change.

- [ ] **Step 1: Update the time tests to expect Friday 09:00**

In `tests/unit/time.test.ts`, replace the two `signupOpensAt` expectations:

```ts
expect(s.signupOpensAt.toISOString()).toBe('2027-03-26T06:00:00.000Z') // Fri 09:00 +03
```

```ts
expect(s.signupOpensAt.toISOString()).toBe('2027-10-29T06:00:00.000Z') // Fri 09:00 +03
```

- [ ] **Step 2: Update the match-phase and tick tests to the new boundary**

In `tests/domain/matchView.test.ts`, change the before/open boundary to:

```ts
expect((await at('2027-03-26T05:00:00Z')).phase).toBe('before')
expect((await at('2027-03-26T06:00:00Z')).phase).toBe('open')
```

In `tests/domain/tick.test.ts`, change:

```ts
const fridayNine = new Date('2027-03-26T06:00:00Z')
```

- [ ] **Step 3: Update the notification boundary and add the exact-time tests**

In `tests/domain/notifications.test.ts`, change the `signup_open` entry of the `it.each` table to:

```ts
['signup_open', '2027-03-26T06:00:00.000Z', '2027-03-26T06:30:00.000Z'],
```

Leave the later-match test's `2027-03-27T06:00:00.000Z` unchanged; that match's signup opens at 09:00 on Saturday 2027-03-27, which is the same instant.

Add these two tests after the boundary test:

```ts
it('sends signup_open at a custom signup time, not nine hours later', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const signupAt = new Date('2027-03-25T12:00:00.000Z')
  await testDb.update(matches).set({ signupOpensAt: signupAt }).where(eq(matches.id, match.id))
  const { member } = await createMember(testDb, { name: 'Ana' })
  await savePushSubscription(testDb, { memberId: member.id, ...subscription })
  const transport = transportOk()

  expect(await processDueNotifications(testDb, new Date('2027-03-25T11:59:00.000Z'), transport)).toEqual({ sent: 0 })
  expect(await processDueNotifications(testDb, signupAt, transport)).toEqual({ sent: 1 })
  expect(await testDb.select().from(notificationLog)).toMatchObject([
    { eventKey: `signup_open:match:${match.id}`, memberId: member.id, sentAt: signupAt },
  ])
})

it('sends the signup push on the next tick after Open signups now', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const { member } = await createMember(testDb, { name: 'Ana' })
  await savePushSubscription(testDb, { memberId: member.id, ...subscription })
  const openedAt = new Date('2027-03-26T05:00:00.000Z')

  const opened = await openSignupsNow(testDb, { actorId: admin.id, matchId: match.id, now: openedAt })
  expect(opened.ok).toBe(true)
  expect(await processDueNotifications(testDb, openedAt, transportOk())).toEqual({ sent: 1 })
})
```

Add `openSignupsNow` to the existing `@/domain/matches` import at the top of the test file.

- [ ] **Step 4: Run the targeted tests to verify they fail**

Run:

```bash
npx vitest run tests/unit/time.test.ts tests/domain/matchView.test.ts tests/domain/tick.test.ts tests/domain/notifications.test.ts
```

Expected: failures showing the old `22:00Z`/`07:00Z` values and the missing exact-time behavior. The database tests require the test Postgres instance (`docker compose up -d db` if it is not running).

- [ ] **Step 5: Implement the new schedule and window**

In `src/lib/time.ts`, change the `signupOpensAt` line to:

```ts
const signupOpensAt = matchDateTime.minus({ days: 4 }).set({ hour: 9, minute: 0 }).toJSDate()
```

and update the comment above it to say Friday 09:00.

In `src/domain/notifications.ts`, change the `signup_open` window entry to:

```ts
['signup_open', match.signupOpensAt.getTime()],
```

In `tests/helpers/fixtures.ts`, update the fixture's signup time to:

```ts
signupOpensAt: new Date('2027-03-26T06:00:00Z'),
```

- [ ] **Step 6: Run the targeted tests to verify they pass**

Run:

```bash
npx vitest run tests/unit/time.test.ts tests/domain/matchView.test.ts tests/domain/tick.test.ts tests/domain/notifications.test.ts
```

Expected: all pass.

- [ ] **Step 7: Run the full suite**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Update the design docs**

In `docs/superpowers/specs/2026-11-18-weekly-football-manager-design.md`, replace the two Friday rows in the weekly-cycle table with one row:

```md
| Friday 09:00 | Signup opens for members, and the "signup is open" push goes out. 14 spots, first come first served. |
```

Replace the "Calls made" bullet:

```md
- Signup opens at Friday 09:00; the push fires at `signupOpensAt`.
```

In `docs/superpowers/specs/2026-11-20-tuesday-football-adjustments-design.md`, replace both references to the automatic "Friday 00:00" start with "Friday 09:00".

- [ ] **Step 9: Commit**

```bash
git add src/lib/time.ts src/domain/notifications.ts tests/unit/time.test.ts tests/domain/matchView.test.ts tests/domain/tick.test.ts tests/domain/notifications.test.ts tests/helpers/fixtures.ts docs/superpowers/specs/2026-11-27-signup-push-at-open-design.md docs/superpowers/plans/2026-11-27-signup-push-at-open.md docs/superpowers/specs/2026-11-18-weekly-football-manager-design.md docs/superpowers/specs/2026-11-20-tuesday-football-adjustments-design.md
git commit -m "feat: send signup push when signups open"
```
