# Weekly Football Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, multi-language PWA where 19 friends sign up for 14 weekly football spots, queue for cancellations, and settle a monthly per-match bill with guest payments and a pot view.

**Architecture:** Next.js App Router on Vercel, MySQL on DreamHost via Drizzle. Domain rules live in framework-free service modules under `src/domain`, tested against a real MySQL test database. Server actions and server components are thin wrappers. An idempotent `/api/tick` endpoint, called by a free external scheduler, performs locks, queue expiry and scheduled pushes; every request also runs cheap lazy transitions.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, MySQL 8 + Drizzle ORM + mysql2, Luxon, next-intl, web-push, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-weekly-football-manager-design.md`

## Global Constraints

- Node 22+; TypeScript strict; npm.
- All database datetimes are UTC; every schedule is computed in `Asia/Jerusalem` and then stored as an instant.
- Money is integer **agorot**; ₪35 = `3500`. Never floats.
- Defaults: capacity `14`, cost `3500`, kickoff `20:30`, queue window `30` minutes.
- Billing month is `YYYY-MM` derived from kickoff in `Asia/Jerusalem`.
- Locales: `he` (RTL), `en`, `es`. Default `en`; cookie `locale` wins, then `Accept-Language`.
- No passwords. Login is a personal invite link; sessions are random tokens stored hashed.
- Guests never log in and are never billed in-app.
- Admin money/roster actions are audited; charge amounts are never edited directly.
- Locks, charges, offers and notifications must be idempotent under repeated or concurrent ticks.
- Money-relevant match fields (cost, capacity, phase times, match date) freeze at lock; venue, kickoff and notes stay editable.
- Tests run against a real MySQL 8 database named `futbol_test`; no mocked SQL.
- Migrations are explicit (`npm run db:migrate`); never run automatically on deploy.

## Review Focus

1. **DST week:** a match on 2027-03-30 opens signup under UTC+2 and locks under UTC+3. Lock must remain Tuesday 14:00 local and charges must land in March. Owned by Task 3, pinned again in Task 17.
2. **Last-spot stampede:** 20 members signing up simultaneously for one remaining spot must yield exactly one confirmed entry, never 15+ or a double charge. Owned by Task 6.
3. **Retried tick:** two ticks at lock time must create one charge per member and send each notification once. Owned by Tasks 8 and 17.
4. **Multi-month payment:** ₪105 settling three ₪35 months must allocate oldest-first; an overpayment leaves a credit, not silent cash. Owned by Task 9.
5. **Post-lock cancellation with a paid guest:** charges are waived, the guest payment is reversed with a refund row, the member's balance and the pot both reflect it, and nothing is deleted. Owned by Tasks 8 and 9.

---

### Task 1: Scaffold, tooling and local MySQL

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `src/app/layout.tsx`, `src/app/page.tsx`, `docker-compose.yml`, `init/01-test-db.sql`, `.env.example`, `.env.test`, `.env.local`, `vitest.config.ts`, `tests/smoke.test.ts`
- Modify: `.gitignore`, `package.json` scripts

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test`, `db:generate`, `db:migrate`, `seed`, `check-db`; local MySQL at `127.0.0.1:3306` with databases `futbol` and `futbol_test`; `tests/smoke.test.ts` proving Vitest runs.

- [ ] **Step 1: Scaffold the app in the repo**

Run:
```bash
npx create-next-app@latest . --ts --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm --yes
```
If it refuses because the directory is not empty, scaffold in a temp directory with the same command and copy everything except `node_modules`, `.git` and `docs` into the repo root.

- [ ] **Step 2: Install runtime and dev dependencies**

Run:
```bash
npm i drizzle-orm mysql2 luxon next-intl web-push zod
npm i -D drizzle-kit vitest dotenv tsx @types/luxon
```

- [ ] **Step 3: Add local MySQL and test database**

Create `docker-compose.yml`:
```yaml
services:
  db:
    image: mysql:8.0
    ports: ["3306:3306"]
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: futbol
      MYSQL_USER: futbol
      MYSQL_PASSWORD: futbol
    volumes:
      - futbol-data:/var/lib/mysql
      - ./init:/docker-entrypoint-initdb.d
volumes:
  futbol-data:
```
Create `init/01-test-db.sql`:
```sql
CREATE DATABASE IF NOT EXISTS futbol_test;
GRANT ALL PRIVILEGES ON futbol_test.* TO 'futbol'@'%';
FLUSH PRIVILEGES;
```

- [ ] **Step 4: Add environment templates**

`.env.example` (committed) and `.env.local` + `.env.test` (gitignored) contain:
```
DATABASE_URL=mysql://futbol:futbol@127.0.0.1:3306/futbol
TEST_DATABASE_URL=mysql://futbol:futbol@127.0.0.1:3306/futbol_test
APP_URL=http://localhost:3000
TICK_SECRET=change-me
VAPID_SUBJECT=mailto:admin@example.com
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```
Add the npm scripts:
```json
"test": "vitest run",
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"seed": "tsx scripts/seed.ts",
"check-db": "tsx scripts/check-db.ts"
```

- [ ] **Step 5: Configure Vitest and write the smoke test**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    fileParallelism: false,
    setupFiles: ['tests/setup.ts'],
    globalSetup: ['tests/global-setup.ts'],
  },
})
```
`tests/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

describe('tooling', () => {
  it('runs', () => { expect(1 + 1).toBe(2) })
})
```
Create empty `tests/setup.ts` and `tests/global-setup.ts` placeholders for now (both export nothing).

- [ ] **Step 6: Start the database and verify**

Run:
```bash
docker compose up -d db
npm test
npm run build
```
Expected: smoke test passes; production build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with MySQL, Vitest and tooling"
```

---

### Task 2: Database schema, client and test harness

**Files:**
- Create: `src/db/schema.ts`, `src/db/index.ts`, `src/db/types.ts`, `drizzle.config.ts`, `drizzle/` (generated migration), `tests/db.ts`, `tests/global-setup.ts` (replace), `tests/db/schema.test.ts`, `scripts/check-db.ts`
- Modify: `package.json` if Drizzle needs a config path (default is fine)

**Interfaces:**
- Produces: `createDb(url: string)` and `db` from `src/db/index.ts`; `type Db`, `type Tx`, `type Executor`; all tables and enums from `src/db/schema.ts`; test helpers `testDb` and `resetDb()` from `tests/db.ts`.

- [ ] **Step 1: Write the failing schema test**

`tests/db/schema.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb, resetDb } from '../db'
import { charges, entries, matches, members } from '@/db/schema'

async function seedMatch() {
  const [member] = await testDb.insert(members).values({ name: 'Ana' }).$returningId()
  const [match] = await testDb.insert(matches).values({
    matchDate: '2027-03-30',
    kickoffAt: new Date('2027-03-30T17:30:00Z'),
    signupOpensAt: new Date('2027-03-25T22:00:00Z'),
    guestPhaseAt: new Date('2027-03-29T11:00:00Z'),
    lockAt: new Date('2027-03-30T11:00:00Z'),
    venue: 'Campo',
    costAgorot: 3500,
    capacity: 14,
  }).$returningId()
  return { memberId: member.id, matchId: match.id }
}

describe('schema constraints', () => {
  beforeEach(resetDb)

  it('rejects a second charge for the same member and match', async () => {
    const { memberId, matchId } = await seedMatch()
    const row = { matchId, memberId, amountAgorot: 3500, billingMonth: '2027-03' }
    await testDb.insert(charges).values(row)
    await expect(testDb.insert(charges).values(row)).rejects.toThrow()
  })

  it('rejects a second member entry but allows many guest entries without a member', async () => {
    const { memberId, matchId } = await seedMatch()
    await testDb.insert(entries).values({ matchId, memberId, kind: 'member', status: 'confirmed' })
    await expect(testDb.insert(entries).values({ matchId, memberId, kind: 'member', status: 'confirmed' })).rejects.toThrow()
    await testDb.insert(entries).values({ matchId, kind: 'guest', guestName: 'Dani', hostMemberId: memberId, status: 'confirmed' })
    await testDb.insert(entries).values({ matchId, kind: 'guest', guestName: 'Dani', hostMemberId: memberId, status: 'confirmed' })
    const guests = await testDb.select().from(entries).where(eq(entries.matchId, matchId))
    expect(guests).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/db/schema.test.ts`
Expected: FAIL because `src/db/schema.ts` does not exist.

- [ ] **Step 3: Write the schema**

Create `src/db/schema.ts` with these tables (InnoDB, utf8mb4; every table gets `createdAt`/`updatedAt` `datetime(3)` where listed; all money is signed `int`):

- `members`: `id` int unsigned auto PK; `name` varchar(120) not null; `role` enum(`member`,`admin`) default `member`; `locale` varchar(5) default `en`; `status` enum(`active`,`disabled`) default `active`; timestamps.
- `loginTokens`: `id` PK; `memberId` FK members; `tokenHash` char(64) unique; `lastUsedAt` datetime(3) null; `revokedAt` null; `createdAt`.
- `sessions`: `id` PK; `memberId` FK; `tokenHash` char(64) unique; `expiresAt`; `userAgent` varchar(255) null; `createdAt`.
- `matches`: `id` PK; `matchDate` char(10) unique not null; `kickoffAt` datetime(3); `signupOpensAt`; `guestPhaseAt`; `lockAt`; `venue` varchar(160) not null default ''; `costAgorot` int unsigned not null; `capacity` smallint unsigned not null; `status` enum(`scheduled`,`locked`,`played`,`cancelled`) default `scheduled`; `notes` text null; timestamps.
- `entries`: `id` PK; `matchId` FK; `kind` enum(`member`,`guest`); `memberId` int unsigned null FK; `guestName` varchar(120) null; `hostMemberId` int unsigned null FK; `status` enum(`confirmed`,`queued`,`offered`,`withdrawn`,`expired`,`removed`) default `confirmed`; `attended` boolean null; `offeredAt` datetime(3) null; `offerExpiresAt` datetime(3) null; timestamps; unique `(matchId, memberId)`; index `(matchId, status)`.
- `charges`: `id` PK; `matchId` FK; `memberId` FK; `amountAgorot` int unsigned; `billingMonth` char(7); `status` enum(`charged`,`waived`) default `charged`; `waivedBy` int unsigned null; `waiveReason` varchar(255) null; timestamps; unique `(matchId, memberId)`; index `(memberId, billingMonth)`.
- `payments`: `id` PK; `memberId` FK; `amountAgorot` int (may be negative for adjustments); `paidAt` datetime(3); `method` enum(`paybox`,`cash`,`other`); `note` varchar(255) null; `recordedBy` int unsigned; `createdAt`.
- `paymentAllocations`: `id` PK; `paymentId` FK payments; `billingMonth` char(7); `amountAgorot` int; `createdAt`; index `(billingMonth)`.
- `guestPayments`: `id` PK; `entryId` FK entries; `amountAgorot` int (negative for refunds); `kind` enum(`payment`,`refund`); `refundOfId` int unsigned null (points at the refunded payment); `paidAt` datetime(3); `recordedBy` int unsigned; `note` varchar(255) null; `createdAt`.
- `expenses`: `id` PK; `billingMonth` char(7) unique; `fieldCostAgorot` int unsigned; `updatedBy` int unsigned; `updatedAt`.
- `pushSubscriptions`: `id` PK; `memberId` FK; `endpoint` varchar(500) unique; `p256dh` varchar(255); `auth` varchar(255); `userAgent` varchar(255) null; `createdAt`.
- `notificationPrefs`: `id` PK; `memberId` FK; `category` enum(`signup_open`,`guest_phase`,`lock_reminder`,`queue_offer`,`bill_ready`,`payment_reminder`); `enabled` boolean default true; unique `(memberId, category)`.
- `notificationLog`: `id` PK; `eventKey` varchar(200); `memberId` FK; `sentAt`; unique `(eventKey, memberId)`.
- `settings`: `key` varchar(80) PK; `value` varchar(255); `updatedAt`.
- `auditLog`: `id` PK; `actorId` int unsigned null; `action` varchar(80); `entity` varchar(40); `entityId` varchar(40) null; `detail` json null; `createdAt`.

Every `datetime` column is declared with `{ mode: 'date', fsp: 3 }`; the connection uses `timezone: 'Z'`, so a JS `Date` maps to a UTC `DATETIME` and back. Never rely on the server's local timezone.

Create `src/db/index.ts`:
```ts
import mysql from 'mysql2/promise'
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2'
import * as schema from './schema'

export function createDb(url: string) {
  const pool = mysql.createPool({ uri: url, connectionLimit: 3, enableKeepAlive: true, timezone: 'Z' })
  return drizzle(pool, { schema, mode: 'default' })
}

export type Db = MySql2Database<typeof schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type Executor = Db | Tx

let cached: Db | null = null
export function getDb(): Db {
  if (!cached) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
    cached = createDb(process.env.DATABASE_URL)
  }
  return cached
}
```
`src/db/types.ts` re-exports `Db`, `Tx`, `Executor`. Application code uses `getDb()`; tests use `createDb(TEST_DATABASE_URL)`. The lazy getter keeps test imports from requiring `DATABASE_URL`.

- [ ] **Step 4: Generate and apply the migration**

Run:
```bash
npx drizzle-kit generate
DATABASE_URL=mysql://futbol:futbol@127.0.0.1:3306/futbol npm run db:migrate
DATABASE_URL=mysql://futbol:futbol@127.0.0.1:3306/futbol_test npm run db:migrate
```
`drizzle.config.ts` reads `DATABASE_URL`, `dialect: 'mysql'`, `schema: './src/db/schema.ts'`, `out: './drizzle'`.

- [ ] **Step 5: Verify the real DreamHost database before building further**

Create `scripts/check-db.ts`:
```ts
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config({ path: '.env.local' })

const conn = await mysql.createConnection(process.env.DATABASE_URL!)
const [rows] = await conn.execute('SELECT VERSION() AS version')
console.log(rows)
await conn.end()
```
Run it against local MySQL first (`npx tsx scripts/check-db.ts`), then set `DATABASE_URL` to the DreamHost database and run it again. If the second run fails, stop: enable Remote MySQL / whitelist the caller and retry. If DreamHost cannot accept remote connections, switch to the proxy fallback described in the spec before writing more code.

- [ ] **Step 6: Build the test harness**

`tests/global-setup.ts` (replace the placeholder):
```ts
import { migrate } from 'drizzle-orm/mysql2/migrator'
import { createDb } from '../src/db'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

export default async function setup() {
  const db = createDb(process.env.TEST_DATABASE_URL!)
  await migrate(db, { migrationsFolder: './drizzle' })
}
```
`tests/db.ts`:
```ts
import dotenv from 'dotenv'
import { sql } from 'drizzle-orm'
import { createDb } from '../src/db'

dotenv.config({ path: '.env.test' })

export const testDb = createDb(process.env.TEST_DATABASE_URL!)

const tables = ['notificationLog','notificationPrefs','pushSubscriptions','auditLog','guestPayments','paymentAllocations','payments','expenses','charges','entries','matches','sessions','loginTokens','members','settings']

export async function resetDb() {
  await testDb.execute(sql.raw('SET FOREIGN_KEY_CHECKS=0'))
  for (const table of tables) await testDb.execute(sql.raw(`TRUNCATE TABLE \`${table}\``))
  await testDb.execute(sql.raw('SET FOREIGN_KEY_CHECKS=1'))
}
```
Both harness files load `.env.test` explicitly; keep that dependency out of application code.

- [ ] **Step 7: Run the tests**

Run: `npm test -- tests/db/schema.test.ts`
Expected: PASS, both constraint tests green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add database schema, client and MySQL test harness"
```

---

### Task 3: Time and money helpers

**Files:**
- Create: `src/lib/time.ts`, `src/lib/result.ts`, `tests/unit/time.test.ts`
- Test: `tests/unit/time.test.ts`

**Interfaces:**
- Produces:
  - `const TZ = 'Asia/Jerusalem'`
  - `weekSchedule(matchDate: string, kickoffTime: string): { kickoffAt: Date; signupOpensAt: Date; guestPhaseAt: Date; lockAt: Date }`
  - `billingMonthOf(date: Date): string` → `YYYY-MM` in `Asia/Jerusalem`
  - `formatMatchDate(date: Date, locale: string): string`
  - `formatMoney(agorot: number, locale: string): string`
  - `type Result<T, E extends string = string> = { ok: true; value: T } | { ok: false; code: E }`
  - `ok<T>(value: T)`, `err<E extends string>(code: E)`

- [ ] **Step 1: Write the failing tests**

`tests/unit/time.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { billingMonthOf, formatMoney, weekSchedule } from '@/lib/time'

describe('weekSchedule', () => {
  it('handles the spring DST change inside one week', () => {
    const s = weekSchedule('2027-03-30', '20:30')
    expect(s.signupOpensAt.toISOString()).toBe('2027-03-25T22:00:00.000Z') // Fri 00:00 +02
    expect(s.guestPhaseAt.toISOString()).toBe('2027-03-29T11:00:00.000Z') // Mon 14:00 +03
    expect(s.lockAt.toISOString()).toBe('2027-03-30T11:00:00.000Z') // Tue 14:00 +03
    expect(s.kickoffAt.toISOString()).toBe('2027-03-30T17:30:00.000Z')
  })

  it('handles the autumn DST change inside one week', () => {
    const s = weekSchedule('2027-11-02', '20:30')
    expect(s.signupOpensAt.toISOString()).toBe('2027-10-28T21:00:00.000Z') // Fri 00:00 +03
    expect(s.guestPhaseAt.toISOString()).toBe('2027-11-01T12:00:00.000Z') // Mon 14:00 +02
    expect(s.lockAt.toISOString()).toBe('2027-11-02T12:00:00.000Z') // Tue 14:00 +02
  })
})

it('derives the billing month in Jerusalem time', () => {
  expect(billingMonthOf(new Date('2027-11-02T17:30:00Z'))).toBe('2027-11')
  expect(billingMonthOf(new Date('2027-11-01T00:30:00Z'))).toBe('2027-11')
})

it('formats money in shekels', () => {
  expect(formatMoney(3500, 'en')).toBe('₪35.00')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/unit/time.test.ts`
Expected: FAIL because `@/lib/time` does not exist.

- [ ] **Step 3: Implement the helpers**

Use Luxon:
- `weekSchedule`: start from `DateTime.fromISO(matchDate, { zone: TZ }).startOf('day')`; signup opens 4 days earlier at 00:00; guest phase 1 day earlier at 14:00; lock the same day at 14:00; kickoff the same day at `kickoffTime`. Return `.toJSDate()`.
- `billingMonthOf`: `DateTime.fromJSDate(date, { zone: TZ }).toFormat('yyyy-MM')`.
- `formatMatchDate`: `Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ })`.
- `formatMoney`: `Intl.NumberFormat(locale, { style: 'currency', currency: 'ILS' }).format(agorot / 100)`; `en` yields `₪35.00`.
- `result.ts` as described with `ok`/`err` constructors.

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- tests/unit/time.test.ts`
Expected: PASS. If `formatMoney(3500,'en')` differs by Node ICU version, assert `toContain('35')` instead and note it in the commit; the DST assertions must stay exact.

- [ ] **Step 5: Commit**

```bash
git add src/lib/time.ts src/lib/result.ts tests/unit/time.test.ts
git commit -m "feat: add timezone-aware schedule and money helpers"
```
---

### Task 4: Settings and match creation

**Files:**
- Create: `src/domain/settings.ts`, `src/domain/matches.ts`, `tests/domain/matches.test.ts`
- Test: `tests/domain/matches.test.ts`

**Interfaces:**
- Consumes: `weekSchedule`, `Db`, schema.
- Produces:
  - `type Settings = { capacity: number; costAgorot: number; venue: string; kickoffTime: string; queueWindowMinutes: number }`
  - `getSettings(db: Db): Promise<Settings>` (defaults when rows are absent)
  - `updateSettings(db: Db, actorId: number, patch: Partial<Settings>): Promise<Result<Settings, 'FORBIDDEN' | 'INVALID_SETTING'>>`
  - `createMatchForDate(db: Db, matchDate: string): Promise<Match>` (returns the existing match for that date)
  - `createNextMatch(db: Db, fromMatchId: number): Promise<Match | null>`
  - `getUpcomingMatch(db: Db, now: Date): Promise<Match | null>` — the earliest non-cancelled match with `kickoffAt >= now − 6h`, status `scheduled` or `locked`; this keeps today's locked match on screen until the game is over, then rolls to next week
  - `getMatch(db: Db, matchId: number): Promise<Match | null>`
  - Defaults: `{ capacity: 14, costAgorot: 3500, venue: '', kickoffTime: '20:30', queueWindowMinutes: 30 }`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb, resetDb } from '../db'
import { matches } from '@/db/schema'
import { getSettings, createMatchForDate, createNextMatch } from '@/domain/matches'

beforeEach(resetDb)

it('returns the documented defaults', async () => {
  expect(await getSettings(testDb)).toEqual({ capacity: 14, costAgorot: 3500, venue: '', kickoffTime: '20:30', queueWindowMinutes: 30 })
})

it('creates a Tuesday match with all phase times', async () => {
  const m = await createMatchForDate(testDb, '2027-03-30')
  expect(m.matchDate).toBe('2027-03-30')
  expect(m.capacity).toBe(14)
  expect(m.costAgorot).toBe(3500)
  expect(m.lockAt.toISOString()).toBe('2027-03-30T11:00:00.000Z')
})

it('is idempotent per date', async () => {
  const a = await createMatchForDate(testDb, '2027-03-30')
  const b = await createMatchForDate(testDb, '2027-03-30')
  expect(b.id).toBe(a.id)
})

it('creates the next match once and never recreates a cancelled date', async () => {
  const m = await createMatchForDate(testDb, '2027-03-30')
  const next = await createNextMatch(testDb, m.id)
  expect(next?.matchDate).toBe('2027-04-06')
  expect(await createNextMatch(testDb, m.id)).toBeNull()

  await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, next!.id))
  const m2 = await createMatchForDate(testDb, '2027-04-13')
  await testDb.update(matches).set({ status: 'cancelled' }).where(eq(matches.id, m2.id))
  const after = await createNextMatch(testDb, m.id)
  expect(after).toBeNull()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/domain/matches.test.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement settings**

`getSettings` selects rows from `settings` and merges them over the defaults, parsing numbers. `updateSettings` verifies the actor has `role='admin'` (return `FORBIDDEN`), validates `1 <= capacity <= 40`, `costAgorot > 0`, non-empty kickoff matching `HH:mm`, `5 <= queueWindowMinutes <= 1440` (return `INVALID_SETTING`), upserts the changed keys, writes an audit row, and returns the new settings.

- [ ] **Step 4: Implement match creation**

`createMatchForDate` selects by `matchDate` first and returns it if present. Otherwise it builds the schedule with `weekSchedule(matchDate, settings.kickoffTime)` and inserts a row with `venue` and `costAgorot` from settings, `capacity` from settings, status `scheduled`.
`createNextMatch` loads the source match, computes `matchDate + 7 days` with Luxon in `Asia/Jerusalem`, returns `null` if *any* match (including cancelled) exists for that date, otherwise calls `createMatchForDate`.
`getUpcomingMatch` returns the earliest match with status `scheduled` or `locked` and `kickoffAt >= now − 6h`, ordered by `kickoffAt`; `getMatch` by id.

- [ ] **Step 5: Run the tests and commit**

Run: `npm test -- tests/domain/matches.test.ts` → PASS.
```bash
git add src/domain/settings.ts src/domain/matches.ts tests/domain/matches.test.ts
git commit -m "feat: add settings and weekly match creation"
```

---

### Task 5: Members, invite tokens and sessions

**Files:**
- Create: `src/lib/tokens.ts`, `src/domain/members.ts`, `src/domain/sessions.ts`, `tests/unit/tokens.test.ts`, `tests/domain/auth.test.ts`
- Test: `tests/unit/tokens.test.ts`, `tests/domain/auth.test.ts`

**Interfaces:**
- Consumes: `Db`, `Result`, schema, audit helper (write inline in this task as `writeAudit(executor, input)` in `src/domain/audit.ts`).
- Produces:
  - `generateToken(): string` (32 random bytes, base64url)
  - `hashToken(raw: string): string` (SHA-256 hex)
  - `createMember(db, input: { name: string; role?: 'member' | 'admin'; locale?: string }): Promise<{ member: Member; inviteToken: string }>`
  - `regenerateInvite(db, actorId: number, memberId: number): Promise<Result<{ inviteToken: string }, 'FORBIDDEN' | 'NOT_FOUND'>>`
  - `loginWithInvite(db, rawToken: string, now: Date): Promise<Result<{ member: Member; sessionToken: string }, 'INVALID_TOKEN' | 'DISABLED'>>`
  - `getSessionMember(db, rawSessionToken: string, now: Date): Promise<Member | null>`
  - `revokeSessions(db, memberId: number): Promise<void>`
  - `setMemberStatus(db, actorId: number, memberId: number, status: 'active' | 'disabled'): Promise<Result<Member, 'FORBIDDEN' | 'NOT_FOUND'>>`
  - `writeAudit(executor: Executor, input: { actorId?: number; action: string; entity: string; entityId?: string; detail?: unknown }): Promise<void>`
  - Session lifetime: 365 days.

- [ ] **Step 1: Write the failing token test**

```ts
import { expect, it } from 'vitest'
import { generateToken, hashToken } from '@/lib/tokens'

it('generates unique tokens and hashes deterministically', () => {
  const a = generateToken()
  const b = generateToken()
  expect(a).not.toBe(b)
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(hashToken(a)).toHaveLength(64)
  expect(hashToken(a)).toBe(hashToken(a))
})
```

- [ ] **Step 2: Implement `tokens.ts` and audit helper**

`generateToken` uses `randomBytes(32).toString('base64url')`; `hashToken` uses `createHash('sha256').update(raw).digest('hex')`. `writeAudit` inserts into `auditLog`.

- [ ] **Step 3: Write the failing auth tests**

```ts
import { beforeEach, expect, it } from 'vitest'
import { testDb, resetDb } from '../db'
import { createMember, loginWithInvite, regenerateInvite, revokeSessions, setMemberStatus } from '@/domain/members'
import { getSessionMember } from '@/domain/sessions'
import { loginTokens } from '@/db/schema'

const now = new Date('2027-03-27T10:00:00Z')
beforeEach(resetDb)

it('logs in with a personal link, storing only a hash', async () => {
  const { member, inviteToken } = await createMember(testDb, { name: 'Ana' })
  const rows = await testDb.select().from(loginTokens)
  expect(rows[0].tokenHash).not.toBe(inviteToken)
  const login = await loginWithInvite(testDb, inviteToken, now)
  if (!login.ok) throw new Error(login.code)
  expect(login.value.member.id).toBe(member.id)
  expect((await getSessionMember(testDb, login.value.sessionToken, now))?.id).toBe(member.id)
})

it('rejects a regenerated-away link, a disabled member and an expired session', async () => {
  const admin = (await createMember(testDb, { name: 'Admin', role: 'admin' })).member
  const { member, inviteToken } = await createMember(testDb, { name: 'Bo' })
  await regenerateInvite(testDb, admin.id, member.id)
  expect((await loginWithInvite(testDb, inviteToken, now)).ok).toBe(false)

  const target = await createMember(testDb, { name: 'Cy' })
  await setMemberStatus(testDb, admin.id, target.member.id, 'disabled')
  expect((await loginWithInvite(testDb, target.inviteToken, now)).ok).toBe(false)

  const active = await createMember(testDb, { name: 'Di' })
  const login = await loginWithInvite(testDb, active.inviteToken, now)
  if (!login.ok) throw new Error(login.code)
  const later = new Date(now.getTime() + 366 * 24 * 3600_000)
  expect(await getSessionMember(testDb, login.value.sessionToken, later)).toBeNull()
})
```

- [ ] **Step 4: Implement members and sessions**

`createMember` inserts the member, creates a login token with `hashToken`, inserts an audit row (`member.create`), and returns the raw token once. `regenerateInvite` requires an admin actor, revokes all outstanding login tokens for that member (`revokedAt = now`), deletes that member's sessions (so a lost phone is cut off immediately), creates a new token, audits. `loginWithInvite` finds a non-revoked token by hash, joins the member, rejects disabled or missing, stamps `lastUsedAt`, creates a session with a hashed random token expiring in 365 days, and audits `auth.login`. `getSessionMember` joins `sessions` and `members`, requires `expiresAt > now` and an active member. `revokeSessions` deletes or expires all sessions. `setMemberStatus` requires an admin actor and audits.

- [ ] **Step 5: Run the tests and commit**

Run: `npm test -- tests/unit/tokens.test.ts tests/domain/auth.test.ts` → PASS.
```bash
git add src/lib/tokens.ts src/domain/members.ts src/domain/sessions.ts src/domain/audit.ts tests/unit/tokens.test.ts tests/domain/auth.test.ts
git commit -m "feat: add members, invite links and sessions"
```

---

### Task 6: Signup, withdrawal and guest entries

**Files:**
- Create: `src/domain/entries.ts`, `tests/domain/entries.test.ts`
- Test: `tests/domain/entries.test.ts`

**Interfaces:**
- Consumes: `Db`, `Result`, `getMatch`, schema; helper `makeMembers(db, n)` in tests.
- Produces:
  - `type EntryView = Entry & { memberName: string | null }`
  - `signup(db, input: { memberId: number; matchId: number; now: Date }): Promise<Result<Entry, 'MATCH_LOCKED' | 'NOT_OPEN' | 'FULL' | 'ALREADY_SIGNED_UP' | 'MATCH_CANCELLED'>>`
  - `withdraw(db, input: { entryId: number; actorMemberId: number; now: Date }): Promise<Result<Entry, 'NOT_FOUND' | 'NOT_OWNER' | 'LOCKED' | 'NOT_WITHDRAWABLE'>>`
  - `addGuest(db, input: { hostMemberId: number; matchId: number; name: string; now: Date }): Promise<Result<Entry, 'GUEST_PHASE_CLOSED' | 'FULL' | 'MATCH_LOCKED' | 'INVALID_NAME' | 'MATCH_CANCELLED'>>`
  - `removeGuest(db, input: { entryId: number; actorMemberId: number; asAdmin?: boolean; now: Date }): Promise<Result<Entry, 'NOT_FOUND' | 'NOT_OWNER' | 'LOCKED' | 'NOT_GUEST'>>`
  - `confirmedCount(db: Db, matchId: number): Promise<number>`
  - `pendingOfferCount(db: Db, matchId: number): Promise<number>` (needed by Task 7, defined here)
  - `freeSpots(db, matchId, executor?): Promise<number>` = `capacity − confirmed − pending offers` (used by Tasks 7 and 12).

- [ ] **Step 1: Write the failing signup tests**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb, resetDb } from '../db'
import { entries, matches, members } from '@/db/schema'
import { createMatchForDate } from '@/domain/matches'
import { addGuest, confirmedCount, signup, withdraw } from '@/domain/entries'

const now = new Date('2027-03-27T10:00:00Z') // Saturday, signup open
beforeEach(resetDb)

async function setup(count = 0) {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const made = []
  for (let i = 0; i < 19; i++) {
    const [m] = await testDb.insert(members).values({ name: `P${i}` }).$returningId()
    made.push(m)
  }
  for (const m of made.slice(0, count)) {
    await testDb.insert(entries).values({ matchId: match.id, memberId: m.id, kind: 'member', status: 'confirmed' })
  }
  return { match, made }
}

it('signs up while open and rejects duplicates', async () => {
  const { match, made } = await setup()
  const first = await signup(testDb, { memberId: made[0].id, matchId: match.id, now })
  expect(first.ok).toBe(true)
  expect((await signup(testDb, { memberId: made[0].id, matchId: match.id, now })).ok).toBe(false)
})

it('rejects signup before the window and after lock', async () => {
  const { match, made } = await setup()
  const before = new Date('2027-03-25T21:59:00Z')
  expect(await signup(testDb, { memberId: made[0].id, matchId: match.id, now: before })).toEqual({ ok: false, code: 'NOT_OPEN' })
  const after = new Date('2027-03-30T11:00:00Z')
  expect(await signup(testDb, { memberId: made[1].id, matchId: match.id, now: after })).toEqual({ ok: false, code: 'MATCH_LOCKED' })
})

it('never confirms more than the capacity under a stampede', async () => {
  const { match, made } = await setup(13)
  const attempts = made.slice(13).map(m => signup(testDb, { memberId: m.id, matchId: match.id, now }))
  const results = await Promise.all(attempts)
  expect(results.filter(r => r.ok)).toHaveLength(1)
  expect(await confirmedCount(testDb, match.id)).toBe(14)
})

it('frees a spot on withdrawal before lock and blocks it after', async () => {
  const { match, made } = await setup(13)
  const joined = await signup(testDb, { memberId: made[13].id, matchId: match.id, now })
  if (!joined.ok) throw new Error(joined.code)
  expect((await withdraw(testDb, { entryId: joined.value.id, actorMemberId: made[13].id, now })).ok).toBe(true)

  const again = await signup(testDb, { memberId: made[13].id, matchId: match.id, now })
  if (!again.ok) throw new Error(again.code)
  const after = new Date('2027-03-30T11:01:00Z')
  expect(await withdraw(testDb, { entryId: again.value.id, actorMemberId: made[13].id, now: after })).toEqual({ ok: false, code: 'LOCKED' })
})

it('opens guests only from Monday 14:00 and counts them against capacity', async () => {
  const { match, made } = await setup(13)
  const early = new Date('2027-03-29T10:59:00Z')
  expect(await addGuest(testDb, { hostMemberId: made[0].id, matchId: match.id, name: 'Dani', now: early })).toEqual({ ok: false, code: 'GUEST_PHASE_CLOSED' })
  const open = new Date('2027-03-29T11:00:00Z')
  expect((await addGuest(testDb, { hostMemberId: made[0].id, matchId: match.id, name: 'Dani', now: open })).ok).toBe(true)
  expect((await addGuest(testDb, { hostMemberId: made[0].id, matchId: match.id, name: 'Eli', now: open })).ok).toBe(true)
  expect((await addGuest(testDb, { hostMemberId: made[0].id, matchId: match.id, name: 'TooLate', now: open })).ok).toBe(false)
})
```

Fix the withdrawal test to confirm a real entry (use `signup` for member index 14 then withdraw it), and don't insert stray confirmed rows that would exceed capacity. Import `confirmedCount`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/domain/entries.test.ts`
Expected: FAIL because `src/domain/entries.ts` does not exist.

- [ ] **Step 3: Implement the entry service**

All mutations run inside `db.transaction`. First load the match with `.for('update')` so signups for one match serialize. Read the confirmed entries and pending offers with locking reads as well (`.for('update')`), not plain snapshot reads, so a waiting transaction sees every earlier winner. Then:
- Reject `status !== 'scheduled'` as `MATCH_CANCELLED` or `MATCH_LOCKED` depending on status/time.
- `signup`: reject `now < signupOpensAt` (`NOT_OPEN`), `now >= lockAt` (`MATCH_LOCKED`), existing entry (`ALREADY_SIGNED_UP`), and `freeSpots() <= 0` (`FULL`); insert confirmed member entry.
- `withdraw`: load entry; owner check (unless actor is admin? no — withdrawal is self-service only); require `status='confirmed'`; reject at/after lock; set `withdrawn`; then call `offerNext` from Task 7 (import inside the function to avoid a cycle).
- `addGuest`: reject before `guestPhaseAt`, at/after lock, empty trimmed name, `freeSpots() <= 0`; insert confirmed guest entry with `hostMemberId`.
- `removeGuest`: actor must be the host or an admin; must be `kind='guest'` and confirmed; reject at/after lock; set `removed`; call `offerNext`.
- `freeSpots` counts confirmed entries and pending (non-expired) offers inside the same transaction.

Use `now` from the caller, never `new Date()` inside services.

- [ ] **Step 4: Run it to verify it passes**

Add one more test before running: the host can remove their own guest before lock, and a different member gets `NOT_OWNER`.

Run: `npm test -- tests/domain/entries.test.ts`
Expected: PASS, including exactly one winner of the 6-way stampede.

- [ ] **Step 5: Commit**

```bash
git add src/domain/entries.ts tests/domain/entries.test.ts
git commit -m "feat: add member signup, withdrawal and guest entries"
```

---

### Task 7: Queue, offers and claims

**Files:**
- Create: `src/domain/queue.ts`, `tests/domain/queue.test.ts`
- Modify: `src/domain/entries.ts` (call `offerNext` after withdraw/removeGuest)
- Test: `tests/domain/queue.test.ts`

**Interfaces:**
- Consumes: entries service, `Db`, `Result`, settings (`queueWindowMinutes`).
- Produces:
  - `joinQueue(db, input: { memberId: number; matchId: number; now: Date }): Promise<Result<Entry, 'SPOT_AVAILABLE' | 'MATCH_LOCKED' | 'ALREADY_IN_MATCH' | 'ALREADY_QUEUED' | 'MATCH_CANCELLED'>>`
  - `leaveQueue(db, input: { memberId: number; matchId: number; now: Date }): Promise<Result<Entry, 'NOT_QUEUED' | 'MATCH_LOCKED'>>`
  - `offerNext(db: Db, matchId: number, now: Date): Promise<Entry | null>` — offers the oldest queued entry while free spots exceed pending offers; sets `status='offered'`, `offeredAt`, `offerExpiresAt = now + queueWindowMinutes`.
  - `expireOffers(db: Db, matchId: number, now: Date): Promise<{ expired: number; offered: Entry | null }>` — expires offers whose `offerExpiresAt <= now`, then calls `offerNext`.
  - `claimOffer(db, input: { entryId: number; memberId: number; now: Date }): Promise<Result<Entry, 'NOT_FOUND' | 'NOT_OWNER' | 'NOT_OFFERED' | 'OFFER_EXPIRED' | 'FULL' | 'MATCH_LOCKED'>>`

- [ ] **Step 1: Write the failing queue tests**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { testDb, resetDb } from '../db'
import { entries } from '@/db/schema'
import { createMatchForDate } from '@/domain/matches'
import { offerNext, claimOffer, joinQueue, leaveQueue, expireOffers } from '@/domain/queue'
import { signup, withdraw } from '@/domain/entries'

const now = new Date('2027-03-27T10:00:00Z')
beforeEach(resetDb)

it('offers a freed spot to the oldest queued member, exclusively', async () => {
  const { match, members } = await fullMatch() // 14 confirmed, 2 queued in order
  await withdraw(testDb, { entryId: await entryId(match.id, members[0].id), actorMemberId: members[0].id, now })
  const offer = await pendingOffer(match.id)
  expect(offer?.memberId).toBe(members[14].id)
  expect(offer?.status).toBe('offered')
  // a public signup cannot steal the reserved spot
  const steal = await signup(testDb, { memberId: members[17].id, matchId: match.id, now })
  expect(steal).toEqual({ ok: false, code: 'FULL' })
})

it('claims an offer and expires it into the next member', async () => {
  const { match, members } = await fullMatch()
  await withdraw(testDb, { entryId: await entryId(match.id, members[0].id), actorMemberId: members[0].id, now })
  const offer = await pendingOffer(match.id)
  const claimed = await claimOffer(testDb, { entryId: offer!.id, memberId: members[14].id, now: new Date(now.getTime() + 60_000) })
  expect(claimed.ok).toBe(true)

  const second = await pendingOffer(match.id)
  expect(second).toBeNull()
  // free another spot, then let the offer expire and move to the third queued member
  await withdraw(testDb, { entryId: await entryId(match.id, members[1].id), actorMemberId: members[1].id, now })
  expect((await pendingOffer(match.id))?.memberId).toBe(members[15].id)
  const late = new Date(now.getTime() + 31 * 60_000)
  const expired = await expireOffers(testDb, match.id, late)
  expect(expired.expired).toBe(1)
  expect(expired.offered?.memberId).toBe(members[16].id)
})

it('lets a member leave the queue', async () => {
  const { match, members } = await fullMatch()
  const res = await leaveQueue(testDb, { memberId: members[15].id, matchId: match.id, now })
  expect(res.ok).toBe(true)
})
```

Provide `fullMatch()`, `entryId()` and `pendingOffer()` helpers in the test file. `fullMatch` creates 18 members, signs the first 14 up and queues members 14, 15 and 16 in that order. Add two more tests: two withdrawals in a row produce two simultaneous offers, and during the guest phase a guest cannot take a spot that a pending offer reserves (`FULL`).

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/domain/queue.test.ts`
Expected: FAIL because `src/domain/queue.ts` does not exist.

- [ ] **Step 3: Implement the queue**

`joinQueue` locks the match row, rejects a locked/cancelled match, an existing confirmed entry, an existing queued/offered entry, and joins only when `freeSpots() === 0` (`SPOT_AVAILABLE`). `leaveQueue` deletes or marks `withdrawn` the queue row. `offerNext` runs inside a transaction: locks the match, counts confirmed and pending offers, and while `confirmed + pendingOffers < capacity` promotes the oldest `status='queued'` entry; if there are no queued entries it returns `null`. `expireOffers` marks expired offers, then calls `offerNext`. `claimOffer` locks the match and entry, checks owner and status, checks expiry against `now`, checks `confirmed < capacity`, then sets `confirmed` and clears offer timestamps. Non-expired claims are transactional; exactly one claim can win a spot.

Modify `withdraw` and `removeGuest` to call `offerNext(db, matchId, now)` after commit (or within the same transaction before commit; either is fine as long as `offerNext` uses the same executor).

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- tests/domain/queue.test.ts tests/domain/entries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/queue.ts src/domain/entries.ts tests/domain/queue.test.ts
git commit -m "feat: add FIFO queue with timed exclusive offers"
```
---

### Task 8: Lock, charges, waivers and post-lock roster edits

**Files:**
- Create: `src/domain/lock.ts`, `src/domain/charges.ts`, `tests/domain/lock.test.ts`
- Test: `tests/domain/lock.test.ts`

**Interfaces:**
- Consumes: `Db`, `Result`, `Tx`/`Executor`, `billingMonthOf`, `writeAudit`, schema, settings.
- Produces:
  - `lockMatch(db: Db, matchId: number, now: Date): Promise<Result<{ chargesCreated: number }, 'NOT_FOUND'>>`
  - `advanceMatch(db: Db, matchId: number, now: Date): Promise<void>` — lock when due, expire offers, mark `played` 3 hours after kickoff.
  - `waiveCharge(db, input: { actorId: number; chargeId: number; reason: string }): Promise<Result<Charge, 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_REASON' | 'ALREADY_WAIVED'>>`
  - `restoreCharge(db, input: { actorId: number; chargeId: number }): Promise<Result<Charge, 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_WAIVED'>>`
  - `adminAddEntry(db, input: { actorId: number; matchId: number; memberId: number; now: Date; reason: string }): Promise<Result<Entry, 'FORBIDDEN' | 'MATCH_CANCELLED' | 'FULL' | 'ALREADY_IN_MATCH' | 'INVALID_REASON'>>`
  - `adminRemoveEntry(db, input: { actorId: number; entryId: number; now: Date; reason: string }): Promise<Result<Entry, 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_CONFIRMED' | 'INVALID_REASON'>>`
  - `setAttendance(db, input: { actorId: number; entryId: number; attended: boolean }): Promise<Result<Entry, 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_CONFIRMED'>>`

- [ ] **Step 1: Write the failing lock tests**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb, resetDb } from '../db'
import { auditLog, charges, entries, members } from '@/db/schema'
import { createMatchForDate } from '@/domain/matches'
import { lockMatch, waiveCharge, adminAddEntry, adminRemoveEntry } from '@/domain/lock'
import { signup } from '@/domain/entries'

const lockTime = new Date('2027-03-30T11:00:00Z')
beforeEach(resetDb)

it('charges confirmed members once, including no-shows, and never guests', async () => {
  const { match, people } = await setup() // 1 admin, 3 members signed up, 1 guest
  const first = await lockMatch(testDb, match.id, lockTime)
  const second = await lockMatch(testDb, match.id, lockTime)
  expect(first.ok && first.value.chargesCreated).toBe(3)
  expect(second.ok && second.value.chargesCreated).toBe(0)
  const rows = await testDb.select().from(charges).where(eq(charges.matchId, match.id))
  expect(rows).toHaveLength(3)
  expect(rows[0].billingMonth).toBe('2027-03')
  expect(rows[0].amountAgorot).toBe(3500)
})

it('requires a reason and an admin to waive, and audits it', async () => {
  const { match, people } = await setup()
  await lockMatch(testDb, match.id, lockTime)
  const [charge] = await testDb.select().from(charges).where(eq(charges.matchId, match.id))
  const denied = await waiveCharge(testDb, { actorId: people.member.id, chargeId: charge.id, reason: 'sub' })
  expect(denied).toEqual({ ok: false, code: 'FORBIDDEN' })
  const empty = await waiveCharge(testDb, { actorId: people.admin.id, chargeId: charge.id, reason: '  ' })
  expect(empty).toEqual({ ok: false, code: 'INVALID_REASON' })
  const waived = await waiveCharge(testDb, { actorId: people.admin.id, chargeId: charge.id, reason: 'substitute found' })
  expect(waived.ok).toBe(true)
  const logs = await testDb.select().from(auditLog).where(eq(auditLog.action, 'charge.waive'))
  expect(logs).toHaveLength(1)
})

it('charges added members and waives removed members after lock', async () => {
  const { match, people } = await setup()
  await lockMatch(testDb, match.id, lockTime)
  const added = await adminAddEntry(testDb, { actorId: people.admin.id, matchId: match.id, memberId: people.extra.id, now: lockTime, reason: 'replacement' })
  expect(added.ok).toBe(true)
  const addedCharges = await testDb.select().from(charges).where(eq(charges.memberId, people.extra.id))
  expect(addedCharges).toHaveLength(1)

  const entry = added.ok ? added.value : null
  const removed = await adminRemoveEntry(testDb, { actorId: people.admin.id, entryId: entry!.id, now: lockTime, reason: 'dropped' })
  expect(removed.ok).toBe(true)
  const [charge] = await testDb.select().from(charges).where(eq(charges.memberId, people.extra.id))
  expect(charge.status).toBe('waived')
})
```

`setup()` creates an admin, 14 members, a match, signs 3 members up, adds one guest during the guest phase, and returns ids. Use the guest phase Monday as `now` for signup calls. Add an assertion that a queued entry and a pending offer become `expired` at lock and never produce charges.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/domain/lock.test.ts`
Expected: FAIL because `src/domain/lock.ts` does not exist.

- [ ] **Step 3: Implement `lockMatch` and `advanceMatch`**

`lockMatch` runs in one transaction with the match row locked. If `status !== 'scheduled'` or `now < lockAt`, return `{ok:true,value:{chargesCreated:0}}`. Otherwise: set `status='locked'`; set all `queued`/`offered` entries to `expired`; insert one charge per `confirmed` entry with `kind='member'` using the match's `costAgorot` and `billingMonthOf(kickoffAt)`; write audit `match.lock`; return the count. The unique `(matchId, memberId)` index is the second line of defence against duplicates.

`advanceMatch` loads the match, calls `lockMatch` when due, calls `expireOffers` (Task 7) while still scheduled, and moves `locked` matches to `played` when `now >= kickoffAt + 3 hours`. It must be safe to call repeatedly and from many requests.

- [ ] **Step 4: Implement admin charge and roster functions**

All of these first verify the actor has `role='admin'` (`FORBIDDEN`), run in a transaction, and call `writeAudit` in the same transaction:
- `waiveCharge`: trim reason, reject empty; set `status`, `waivedBy`, `waiveReason`; action `charge.waive`.
- `restoreCharge`: set back to `charged` and clear fields; action `charge.restore`.
- `adminAddEntry`: for a scheduled match, insert a confirmed member entry (capacity check, `ALREADY_IN_MATCH`); for a locked match, insert the entry **and** its charge; reason required only after lock. Action `entry.admin_add`.
- `adminRemoveEntry`: mark `removed`; if the match is locked, waive that member's charge with the reason. Action `entry.admin_remove`.
- `setAttendance`: only on confirmed entries; sets `attended`. Action `entry.attendance`.

- [ ] **Step 5: Run the tests and commit**

Run: `npm test -- tests/domain/lock.test.ts` → PASS.
```bash
git add src/domain/lock.ts src/domain/charges.ts tests/domain/lock.test.ts
git commit -m "feat: lock matches, create charges and audit roster overrides"
```

---

### Task 9: Billing, payments, pot and cancellation

**Files:**
- Create: `src/domain/billing.ts`, `tests/domain/billing.test.ts`
- Test: `tests/domain/billing.test.ts`

**Interfaces:**
- Consumes: `Db`, `Result`, schema, `billingMonthOf`, `writeAudit`, lock service.
- Produces:
  - `memberBalance(db: Db, memberId: number): Promise<{ chargesAgorot: number; paidAgorot: number; balanceAgorot: number }>` (`balance = charges − paid`; negative means credit)
  - `memberBill(db: Db, memberId: number, month: string): Promise<{ charges: Charge[]; allocations: Array<{ billingMonth: string; amountAgorot: number; payment: Payment }>; dueAgorot: number }>`
  - `recordPayment(db, input: { actorId: number; memberId: number; amountAgorot: number; paidAt: Date; method: 'paybox' | 'cash' | 'other'; note?: string; targetMonth?: string }): Promise<Result<Payment, 'FORBIDDEN' | 'MEMBER_NOT_FOUND' | 'INVALID_AMOUNT' | 'TARGET_MONTH_REQUIRED'>>`
  - `recordGuestPayment(db, input: { actorId: number; entryId: number; amountAgorot: number; paidAt: Date; note?: string }): Promise<Result<GuestPayment, 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_AMOUNT' | 'NOT_GUEST'>>`
  - `refundGuestPayment(db, input: { actorId: number; guestPaymentId: number; now: Date; note?: string }): Promise<Result<GuestPayment, 'FORBIDDEN' | 'NOT_FOUND' | 'ALREADY_REFUNDED' | 'INVALID_AMOUNT'>>`
  - `setMonthlyExpense(db, input: { actorId: number; month: string; fieldCostAgorot: number }): Promise<Result<Expense, 'FORBIDDEN' | 'INVALID_AMOUNT'>>`
  - `monthSummary(db: Db, month: string): Promise<{ chargesAgorot: number; memberCollectedAgorot: number; guestCollectedAgorot: number; expenseAgorot: number; collectedAgorot: number; differenceAgorot: number; outstandingAgorot: number }>`
  - `cancelMatch(db, input: { actorId: number; matchId: number; now: Date; reason: string }): Promise<Result<Match, 'FORBIDDEN' | 'NOT_FOUND' | 'ALREADY_CANCELLED' | 'INVALID_REASON'>>`

- [ ] **Step 1: Write the failing allocation tests**

```ts
import { beforeEach, expect, it } from 'vitest'
import { testDb, resetDb } from '../db'
import { charges, members } from '@/db/schema'
import { memberBalance, recordPayment, monthSummary } from '@/domain/billing'

beforeEach(resetDb)

it('allocates oldest debt first and splits across months', async () => {
  const { memberId } = await setupMember()
  await addCharge(memberId, '2027-01', 3500)
  await addCharge(memberId, '2027-02', 7000)

  const p = await recordPayment(testDb, { actorId: adminId, memberId, amountAgorot: 5000, paidAt: now, method: 'paybox' })
  expect(p.ok).toBe(true)
  expect(await allocationsFor(paymentId(p))).toEqual([{ billingMonth: '2027-01', amountAgorot: 3500 }, { billingMonth: '2027-02', amountAgorot: 1500 }])
  expect((await memberBalance(testDb, memberId)).balanceAgorot).toBe(5500)
})

it('leaves an overpayment as credit and never allocates more than the debt', async () => {
  const { memberId } = await setupMember()
  await addCharge(memberId, '2027-02', 7000)
  await recordPayment(testDb, { actorId: adminId, memberId, amountAgorot: 10000, paidAt: now, method: 'cash' })
  expect((await memberBalance(testDb, memberId)).balanceAgorot).toBe(-3000)
  expect((await monthSummary(testDb, '2027-02')).memberCollectedAgorot).toBe(7000)
})

it('honours a target month before older debt', async () => {
  const { memberId } = await setupMember()
  await addCharge(memberId, '2027-01', 3500)
  await addCharge(memberId, '2027-02', 3500)
  const p = await recordPayment(testDb, { actorId: adminId, memberId, amountAgorot: 3500, paidAt: now, method: 'paybox', targetMonth: '2027-02' })
  expect(await allocationsFor(paymentId(p))).toEqual([{ billingMonth: '2027-02', amountAgorot: 3500 }])
})
```

Provide `setupMember()` (creates and returns an admin and a member), a module-level `now`
`const now = new Date('2027-03-30T11:00:00Z')`, `adminId` from the returned admin, and
`addCharge(memberId, month, amount)` (creates a match whose kickoff falls in that month, then inserts the charge).

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/domain/billing.test.ts`
Expected: FAIL because `src/domain/billing.ts` does not exist.

- [ ] **Step 3: Implement payments and allocations**

`recordPayment` requires an admin. Reject `amountAgorot === 0`; require `targetMonth` for negative amounts (`TARGET_MONTH_REQUIRED`). Insert the payment, then allocate in this order: target month first (if given), then all months with outstanding charged amounts oldest-first. For each month, `outstanding = sum(charged charges) − sum(existing allocations)`, allocate `min(remaining, outstanding)`. Never allocate more than `|amount|`; positive remainder is left as credit, negative allocations are capped by the month's collected amount. All in one transaction with audit `payment.record`.

`memberBalance` and `memberBill` query charges, payments and allocations. `balance = sum(charged charges) − sum(payments)`.

- [ ] **Step 4: Write and implement guest payments, refunds and pot**

Add tests:
- guest payment of 3500 for a match in `2027-03` appears in `monthSummary('2027-03').guestCollectedAgorot`.
- refund inserts a negative `kind='refund'` row with `refundOfId` set to the original payment and reduces the pot by 3500; refunding the same payment twice returns `ALREADY_REFUNDED` (checked by `refundOfId`).
- `monthSummary` with charges 7000, member allocation 5000, guest 3500 and expense 20000 returns `collectedAgorot: 8500`, `differenceAgorot: -11500`, `outstandingAgorot: 2000`.

Join `guestPayments → entries → matches` and select matches whose `kickoffAt` falls in the requested `Asia/Jerusalem` month. Guest payment amount defaults to the match cost in the UI. `recordGuestPayment`/`refundGuestPayment` audit as `guest_payment.record`/`guest_payment.refund`; `setMonthlyExpense` upserts by month and audits `expense.set`.

- [ ] **Step 5: Write and implement cancellation**

Add tests:
- cancelling a scheduled match removes entries, creates no charges.
- after lock with one guest payment of 3500, cancelling marks all charges `waived` with reason `match cancelled`, inserts one refund row of `-3500`, and leaves the original guest payment row intact; `monthSummary` shows zero net guest collection.
- a non-admin gets `FORBIDDEN`.

Implement `cancelMatch` transactionally: set `status='cancelled'`, expire queued/offered entries; before lock mark confirmed entries `removed`; after lock waive all `charged` charges (using the reason) and insert a refund for each guest payment that has no refund yet. Audit `match.cancel`.

- [ ] **Step 6: Run the tests and commit**

Run: `npm test -- tests/domain/billing.test.ts` → PASS.
```bash
git add src/domain/billing.ts tests/domain/billing.test.ts
git commit -m "feat: add billing ledger, allocations, pot and cancellation"
```

---

### Task 10: Notifications, push subscriptions and prefs

**Files:**
- Create: `src/lib/push.ts`, `src/lib/notificationCopy.ts`, `src/domain/notifications.ts`, `tests/domain/notifications.test.ts`
- Test: `tests/domain/notifications.test.ts`

**Interfaces:**
- Consumes: `Db`, schema, settings, matches.
- Produces:
  - `type NotificationCategory = 'signup_open' | 'guest_phase' | 'lock_reminder' | 'queue_offer' | 'bill_ready' | 'payment_reminder'`
  - `type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect`
  - `type PushTransport = (subscription: PushSubscriptionRow, payload: NotificationPayload) => Promise<{ statusCode: number }>`
  - `type NotificationPayload = { title: string; body: string; url: string }`
  - `savePushSubscription(db, input: { memberId: number; endpoint: string; p256dh: string; auth: string; userAgent?: string }): Promise<void>`
  - `deletePushSubscription(db, endpoint: string): Promise<void>`
  - `sendWebPush(db, memberId: number, payload: NotificationPayload, transport: PushTransport): Promise<{ sent: number; removed: number }>`
  - `buildNotification(event: NotificationCategory, locale: string, data: { matchDate?: string; venue?: string; url: string; month?: string }): NotificationPayload`
  - `sendMemberNotification(db, input: { memberId: number; category: NotificationCategory; eventKey: string; payload: NotificationPayload; now: Date }, transport: PushTransport): Promise<boolean>` — false when disabled, already logged, or no subscription.
  - `processDueNotifications(db, now: Date, transport: PushTransport): Promise<{ sent: number }>`
  - `notifyOffer(db, entry: Entry, match: Match, transport: PushTransport): Promise<void>`
  - Default transport wraps `web-push.sendNotification` and is only used by production callers.

- [ ] **Step 1: Write the failing dedupe and opt-out tests**

```ts
import { beforeEach, expect, it, vi } from 'vitest'
import { testDb, resetDb } from '../db'
import { createMember } from '@/domain/members'
import { savePushSubscription, sendMemberNotification, buildNotification } from '@/domain/notifications'

beforeEach(resetDb)

it('sends an event at most once per member and respects opt-out', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  await savePushSubscription(testDb, { memberId: member.id, endpoint: 'https://push/1', p256dh: 'k', auth: 'a' })
  const transport = vi.fn().mockResolvedValue({ statusCode: 201 })
  const payload = buildNotification('lock_reminder', 'en', { matchDate: '2027-03-30', url: '/match/1' })
  const input = { memberId: member.id, category: 'lock_reminder' as const, eventKey: 'lock_reminder:match:1', payload, now: new Date() }

  expect(await sendMemberNotification(testDb, input, transport)).toBe(true)
  expect(await sendMemberNotification(testDb, input, transport)).toBe(false)
  expect(transport).toHaveBeenCalledTimes(1)
})
```

Add tests for: disabled category (insert `notificationPrefs` false) → false; 410 transport response removes the subscription; `buildNotification` returns non-empty title/body for `he`, `en`, `es` and includes the URL; `expireOffers`-driven offer notification uses key `queue_offer:{entryId}`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/domain/notifications.test.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement push storage, sending and copy**

`src/lib/push.ts` configures `web-push` lazily from env (`VAPID_SUBJECT`, keys) and exports `defaultTransport`. `sendWebPush` selects subscriptions, calls the transport for each, deletes rows on 404/410, and returns counts. `notificationCopy.ts` holds a plain object of short strings per event and locale with `{{date}}`/`{{month}}` substitution; URLs are passed in.

- [ ] **Step 4: Implement prefs, log and due-event processing**

`sendMemberNotification`: return false if a `notificationPrefs` row for the category is disabled; attempt to insert `(eventKey, memberId)` into `notificationLog` and return false on duplicate key; then send to every subscription. The log row is the dedupe marker, so it is inserted even when the member has zero subscriptions; returning false in that case keeps the UI honest while preventing retry storms.

`processDueNotifications` scans scheduled matches and sends:
- `signup_open` when `now` is within 30 minutes after `signupOpensAt + 9h`.
- `guest_phase` within 30 minutes after `guestPhaseAt`.
- `lock_reminder` within 30 minutes after `lockAt − 90min`.
- `bill_ready` for the previous month when `now` is on the 1st at 09:00 local (±30 min), to every active member.
- `queue_offer` for every entry with `status='offered'` and `offerExpiresAt > now`, via `notifyOffer`; the notification log key `queue_offer:{entryId}` guarantees one push per offer, including offers created by a withdrawal between ticks.

Use event keys `signup_open:match:{id}`, `guest_phase:match:{id}`, `lock_reminder:match:{id}`, `bill_ready:{YYYY-MM}`. Iterate members and locales from each member's `locale`.

- [ ] **Step 5: Run the tests and commit**

Run: `npm test -- tests/domain/notifications.test.ts` → PASS.
```bash
git add src/lib/push.ts src/lib/notificationCopy.ts src/domain/notifications.ts tests/domain/notifications.test.ts
git commit -m "feat: add web push subscriptions and idempotent notifications"
```

---

### Task 11: i18n, layout, login and session helpers

**Files:**
- Create: `next.config.ts` (modify), `src/i18n/request.ts`, `src/i18n/locale.ts`, `messages/en.json`, `messages/he.json`, `messages/es.json`, `src/app/layout.tsx` (modify), `src/app/globals.css` (RTL-safe tweaks), `src/app/login/[token]/route.ts`, `src/app/login/expired/page.tsx`, `src/lib/auth.ts`, `src/app/actions/auth.ts`, `src/components/LocaleSwitcher.tsx`, `src/components/Nav.tsx`, `tests/unit/locale.test.ts`
- Modify: `src/app/page.tsx` (signed-in placeholder)

**Interfaces:**
- Produces:
  - `resolveLocale(cookie?: string, acceptLanguage?: string): 'he' | 'en' | 'es'`
  - `SESSION_COOKIE = 'fm_session'`
  - `getCurrentMember(): Promise<Member | null>` (reads the cookie, uses `getSessionMember`)
  - `requireMember(): Promise<Member>` (redirects to `/login/expired` when null)
  - `requireAdmin(): Promise<Member>` (redirects to `/` for non-admins)
  - `setSessionCookie(token: string): Promise<void>`, `clearSessionCookie(): Promise<void>`
  - `setLocaleAction(locale: string)`, `logoutAction()` server actions
  - Route `GET /login/[token]` → validates, sets cookie, redirects to `/`; invalid/revoked → redirects to `/login/expired`
  - A `messages/{locale}.json` namespace layout: `common`, `nav`, `auth`, `match`, `queue`, `bill`, `admin`, `notifications`, `errors`.

- [ ] **Step 1: Write the failing locale test**

```ts
import { expect, it } from 'vitest'
import { resolveLocale } from '@/i18n/locale'

it('prefers the cookie, then Accept-Language, then English', () => {
  expect(resolveLocale('he', 'en-US,en;q=0.9')).toBe('he')
  expect(resolveLocale(undefined, 'es-AR,es;q=0.9,en;q=0.8')).toBe('es')
  expect(resolveLocale(undefined, 'he-IL,he;q=0.9')).toBe('he')
  expect(resolveLocale(undefined, 'fr-FR,fr;q=0.9')).toBe('en')
  expect(resolveLocale('xx', undefined)).toBe('en')
})
```

- [ ] **Step 2: Implement locale resolution and next-intl**

Add the `next-intl` plugin to `next.config.ts`. `src/i18n/request.ts` reads the `locale` cookie and the `Accept-Language` header via `next/headers`, resolves the locale, and returns the matching messages. No URL locale segments. `layout.tsx` calls `getLocale()` and renders `<html lang={locale} dir={locale === 'he' ? 'rtl' : 'ltr'}>`, wraps children in the next-intl provider, and renders `Nav` and `LocaleSwitcher`.

- [ ] **Step 3: Create the message files**

Start with these keys in all three files (same keys, translated values):
```json
{
  "common": { "appName": "...", "save": "...", "cancel": "...", "copy": "...", "loading": "..." },
  "nav": { "home": "...", "bill": "...", "admin": "...", "logout": "..." },
  "auth": { "signedInAs": "...", "invalidLink": "Link expired or revoked", "askAdmin": "Ask an admin for a new link" },
  "errors": { "NOT_OPEN": "...", "FULL": "...", "MATCH_LOCKED": "...", "ALREADY_SIGNED_UP": "...", "GUEST_PHASE_CLOSED": "...", "FORBIDDEN": "...", "INVALID_REASON": "..." }
}
```
Add screen-specific keys as each UI task needs them. Hebrew values are right-to-left text; no HTML direction markers are required in plain strings.

- [ ] **Step 4: Implement auth helpers and the login route**

`src/lib/auth.ts` wraps `cookies()` and `getSessionMember(getDb(), token, new Date())`. `setSessionCookie` sets `httpOnly`, `sameSite: 'lax'`, `secure: process.env.NODE_ENV === 'production'`, `path: '/'`, `maxAge: 365 * 24 * 3600`. `requireMember` and `requireAdmin` call `redirect()` from `next/navigation`.

`src/app/login/[token]/route.ts`:
```ts
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await loginWithInvite(getDb(), token, new Date())
  if (!result.ok) return NextResponse.redirect(new URL('/login/expired', req.url))
  const res = NextResponse.redirect(new URL('/', req.url))
  res.cookies.set(SESSION_COOKIE, result.value.sessionToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 365 * 24 * 3600 })
  return res
}
```
Add a simple `/login/expired` page with the translated message.

- [ ] **Step 5: Add actions, nav and placeholder home**

`setLocaleAction` validates against the three locales, updates the signed-in member's `locale` column (so push messages match), and sets the `locale` cookie. `logoutAction` deletes the session and clears the cookie, then redirects to `/login/expired`. `Nav` links to `/`, `/bill`, `/admin` (admin only) and shows the current member's name and locale switcher. The home page requires a member and displays a temporary "signed in as …" panel to prove the loop.

- [ ] **Step 6: Verify build and login round-trip**

Run:
```bash
npm test -- tests/unit/locale.test.ts
npm run build
```
Then start `npm run dev`, seed a member manually (insert SQL or reuse Task 19 later), open `/login/<token>` and confirm the cookie is set, the name appears, locale switching changes `dir` to `rtl` for Hebrew, and logout works.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add tri-language layout, session helpers and invite login"
```
---

### Task 12: Member match screen and actions

**Files:**
- Create: `src/domain/matchView.ts`, `src/app/actions/match.ts`, `src/lib/actions.ts`, `src/components/MatchCard.tsx`, `src/components/RosterList.tsx`, `src/components/Countdown.tsx`, `src/components/QueuePanel.tsx`, `src/components/GuestForm.tsx`, `src/components/SubmitButton.tsx`, `tests/domain/matchView.test.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: entries, queue, lock (`advanceMatch`), matches, `getCurrentMember`, i18n messages.
- Produces:
  - `type MatchPhase = 'before' | 'open' | 'guest' | 'locked' | 'played' | 'cancelled'`
  - `getMatchView(db, input: { matchId: number; memberId: number; now: Date }): Promise<{ match: Match; phase: MatchPhase; spotsLeft: number; roster: EntryView[]; queue: EntryView[]; queuePosition: number | null; myEntry: Entry | null; myQueueEntry: Entry | null; myOffer: Entry | null }>`
  - `type ActionResult = { ok: true } | { ok: false; code: string }`
  - Server actions in `src/app/actions/match.ts`: `signupAction`, `withdrawAction`, `joinQueueAction`, `leaveQueueAction`, `claimOfferAction`, `addGuestAction`, `removeGuestAction`. Each takes `(prev: ActionResult, formData: FormData)`, requires a member, reads `matchId` from the form, calls `advanceMatch` first, calls the domain service, calls `revalidatePath('/')`, and returns `ActionResult`. Every form posts the viewed match's id, so a locked match and next week's match can never be confused.

- [ ] **Step 1: Write the failing match-view tests**

```ts
import { beforeEach, expect, it } from 'vitest'
import { testDb, resetDb } from '../db'
import { createMatchForDate } from '@/domain/matches'
import { createMember } from '@/domain/members'
import { signup } from '@/domain/entries'
import { joinQueue } from '@/domain/queue'
import { getMatchView } from '@/domain/matchView'

beforeEach(resetDb)

it('derives the phase from the clock', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const { member } = await createMember(testDb, { name: 'Ana' })
  const at = (iso: string) => getMatchView(testDb, { matchId: match.id, memberId: member.id, now: new Date(iso) })
  expect((await at('2027-03-25T21:00:00Z')).phase).toBe('before')
  expect((await at('2027-03-25T22:00:00Z')).phase).toBe('open')
  expect((await at('2027-03-29T11:00:00Z')).phase).toBe('guest')
  expect((await at('2027-03-30T11:00:00Z')).phase).toBe('locked')
})

it('reports my entry, my queue position and the offer', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const people = []
  for (let i = 0; i < 16; i++) people.push((await createMember(testDb, { name: `P${i}` })).member)
  const now = new Date('2027-03-27T10:00:00Z')
  for (const p of people.slice(0, 14)) await signup(testDb, { memberId: p.id, matchId: match.id, now })
  await joinQueue(testDb, { memberId: people[14].id, matchId: match.id, now })
  await joinQueue(testDb, { memberId: people[15].id, matchId: match.id, now })
  const view = await getMatchView(testDb, { matchId: match.id, memberId: people[15].id, now })
  expect(view.spotsLeft).toBe(0)
  expect(view.queuePosition).toBe(2)
  expect(view.myEntry).toBeNull()
  expect(view.myQueueEntry?.status).toBe('queued')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/domain/matchView.test.ts`
Expected: FAIL because `src/domain/matchView.ts` does not exist.

- [ ] **Step 3: Implement `getMatchView` and the match screen**

Phase order: cancelled → played/locked status → `now >= lockAt` → `now >= guestPhaseAt` → `now >= signupOpensAt` → before. `spotsLeft` uses confirmed count plus pending offers. Queue is ordered by `createdAt`; `queuePosition` is the member's 1-based index. My offer is a confirmed-capacity-independent `status='offered'` entry owned by the member.

Home page: require member, find the match with `getUpcomingMatch(db, new Date())`, call `advanceMatch`, then `getMatchView`, and render:
- `MatchCard`: localized date, venue (or translated "venue TBD"), cost, phase badge, spots left.
- `RosterList`: confirmed members and guests (`guestName` + host name), my row highlighted.
- `Countdown`: client component ticking every second to the next transition (`signupOpensAt`, `guestPhaseAt`, `lockAt`).
- `QueuePanel`: when full and open, "Join queue" / "Leave queue"; when offered, a prominent **Claim spot** button with the expiry time.
- Action buttons for signup/withdraw; `GuestForm` visible only in the guest phase; each guest row shows a remove button for its host.
- If there is no upcoming match, show an empty state.

Client components use `useActionState` with the server action and render `t('errors.' + state.code)` on failure; success relies on revalidation and no message. Use `SubmitButton` with `useFormStatus` for pending state.

- [ ] **Step 4: Implement the server actions**

All actions live in one `'use server'` file. Read `matchId`, `entryId` and `guestName` from `FormData`, call `requireMember`, call `advanceMatch(db, matchId, new Date())`, then the domain service with `new Date()`. Convert `{ok:false,code}` to `ActionResult` verbatim.

- [ ] **Step 5: Verify the screen manually**

Run `npm run dev`. Seed two members and a match whose signup window is open (insert a `matches` row with `signupOpensAt` in the past and `lockAt` in the future). Sign in as each and verify: signup once, duplicate click is rejected with `ALREADY_SIGNED_UP`, the roster updates, withdrawal frees the spot, filling 14 shows the queue button, joining reports position, and Hebrew switches the layout to RTL.

- [ ] **Step 6: Build and commit**

Run: `npm test -- tests/domain/matchView.test.ts && npm run build` → PASS.
```bash
git add src/domain/matchView.ts src/app/actions/match.ts src/lib/actions.ts src/components src/app/page.tsx tests/domain/matchView.test.ts
git commit -m "feat: add member match screen with signup, queue and guests"
```

---

### Task 13: Member bill and notification settings

**Files:**
- Create: `src/app/bill/page.tsx`, `src/app/actions/bill.ts`, `src/components/BillTable.tsx`, `src/components/NotificationPrefs.tsx`, `tests/domain/prefs.test.ts`
- Modify: `src/domain/notifications.ts` (add `setNotificationPref`)

**Interfaces:**
- Adds: `setNotificationPref(db, memberId: number, category: NotificationCategory, enabled: boolean): Promise<void>` and `listNotificationPrefs(db, memberId): Promise<Record<NotificationCategory, boolean>>` (missing rows default to enabled).
- Produces: `savePrefsAction(prev: ActionResult, formData: FormData)` in `src/app/actions/bill.ts`, which requires a member and upserts all six categories from checkbox fields.

- [ ] **Step 1: Write the failing prefs test**

```ts
import { beforeEach, expect, it } from 'vitest'
import { testDb, resetDb } from '../db'
import { createMember } from '@/domain/members'
import { listNotificationPrefs, setNotificationPref } from '@/domain/notifications'

beforeEach(resetDb)

it('defaults every category on and persists a switch-off', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  expect((await listNotificationPrefs(testDb, member.id)).lock_reminder).toBe(true)
  await setNotificationPref(testDb, member.id, 'lock_reminder', false)
  expect((await listNotificationPrefs(testDb, member.id)).lock_reminder).toBe(false)
  expect((await listNotificationPrefs(testDb, member.id)).queue_offer).toBe(true)
})
```

- [ ] **Step 2: Implement prefs and the bill page**

Bill page requires a member; shows the current month's due, the outstanding balance (negative rendered as credit), a list of charges with match dates, and a list of payments with allocations and method. All money uses `formatMoney` in the member's locale. Include the `NotificationPrefs` form with six checkboxes; submitting calls `savePrefsAction` and revalidates `/bill`.

- [ ] **Step 3: Verify and commit**

Run `npm test -- tests/domain/prefs.test.ts` and `npm run build`. Seed charges and a payment; sign in and check the totals against a hand calculation.
```bash
git add src/app/bill src/app/actions/bill.ts src/components/BillTable.tsx src/components/NotificationPrefs.tsx src/domain/notifications.ts tests/domain/prefs.test.ts
git commit -m "feat: add member bill page and notification preferences"
```

---

### Task 14: Admin dashboard, members, invites and settings

**Files:**
- Create: `src/app/admin/page.tsx`, `src/app/admin/members/page.tsx`, `src/app/admin/settings/page.tsx`, `src/app/admin/audit/page.tsx`, `src/components/AdminNav.tsx`, `src/components/InviteLink.tsx`, `src/app/actions/admin.ts`, `tests/domain/settings.test.ts`, `tests/domain/adminMembers.test.ts`
- Modify: `src/app/layout.tsx` (add admin nav link, already conditionally rendered)

**Interfaces:**
- Consumes: `requireAdmin`, members/matches/settings services, audit log.
- Produces server actions in `src/app/actions/admin.ts`:
  - `createNextMatchAction`, `addMemberAction`, `regenerateInviteAction`, `setMemberStatusAction`, `updateSettingsAction`.
  - `addMemberAction` and `regenerateInviteAction` return the raw invite token so the client can show `${APP_URL}/login/${token}` once.
- Adds: `listMembers(db)`, `getAuditLog(db, limit)` in the relevant domain modules.

- [ ] **Step 1: Write the failing admin tests**

```ts
import { beforeEach, expect, it } from 'vitest'
import { testDb, resetDb } from '../db'
import { createMember, setMemberStatus } from '@/domain/members'
import { getSettings, updateSettings } from '@/domain/matches'

beforeEach(resetDb)

it('rejects settings changes from non-admins and invalid values', async () => {
  const { member } = await createMember(testDb, { name: 'Ana' })
  expect(await updateSettings(testDb, member.id, { capacity: 16 })).toEqual({ ok: false, code: 'FORBIDDEN' })
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  expect(await updateSettings(testDb, admin.id, { capacity: 0 })).toEqual({ ok: false, code: 'INVALID_SETTING' })
  const ok = await updateSettings(testDb, admin.id, { capacity: 16, costAgorot: 4000 })
  expect(ok.ok).toBe(true)
  expect((await getSettings(testDb)).costAgorot).toBe(4000)
})

it('only admins can disable a member', async () => {
  const a = (await createMember(testDb, { name: 'A' })).member
  const b = (await createMember(testDb, { name: 'B' })).member
  expect(await setMemberStatus(testDb, a.id, b.id, 'disabled')).toEqual({ ok: false, code: 'FORBIDDEN' })
})
```

- [ ] **Step 2: Implement member and audit list helpers**

Add `listMembers(db)` (name, role, status, locale, created) and `getAuditLog(db, limit)` (newest 200 with actor name). No new tables.

- [ ] **Step 3: Build the admin pages**

- `/admin`: upcoming match card with link to its admin page and a **Create next match** button; counts for members, outstanding balance and this month's pot; links to members, money, settings, audit.
- `/admin/members`: list with role/status; **Add member** form (name, role, locale); each row offers **Copy invite link**, **Regenerate link**, **Disable/Enable**. `InviteLink` is a client component that copies to the clipboard and shows the URL.
- `/admin/settings`: capacity, cost in shekels (converted to agorot on submit), venue, kickoff time, queue window minutes.
- `/admin/audit`: read-only table of actor, action, entity, detail, time.

All page components call `requireAdmin()` first. Every action calls it again server-side (never trust the page).

- [ ] **Step 4: Verify and commit**

Run `npm test -- tests/domain/settings.test.ts tests/domain/adminMembers.test.ts` and `npm run build`. Manually confirm a non-admin cannot open `/admin` and that an invite link logs in.
```bash
git add src/app/admin src/app/actions/admin.ts src/components/AdminNav.tsx src/components/InviteLink.tsx src/domain tests/domain
git commit -m "feat: add admin dashboard, member invites and settings"
```

---

### Task 15: Admin match operations

**Files:**
- Create: `src/app/admin/matches/[id]/page.tsx`, `src/components/AdminRoster.tsx`, `src/components/AttendanceList.tsx`, `src/components/GuestPayments.tsx`, `tests/domain/matchEdits.test.ts`
- Modify: `src/domain/matches.ts` (add `updateMatch`), `src/app/actions/admin.ts`

**Interfaces:**
- Adds: `updateMatch(db, input: { actorId: number; matchId: number; now: Date; patch: { kickoffAt?: Date; venue?: string; capacity?: number; costAgorot?: number; signupOpensAt?: Date; guestPhaseAt?: Date; lockAt?: Date; notes?: string } }): Promise<Result<Match, 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_PATCH' | 'CAPACITY_BELOW_CONFIRMED' | 'MONEY_FIELDS_FROZEN' | 'MATCH_FINISHED'>>`
- Produces server actions: `updateMatchAction`, `cancelMatchAction`, `adminAddEntryAction`, `adminRemoveEntryAction`, `waiveChargeAction`, `restoreChargeAction`, `setAttendanceAction`, `recordGuestPaymentAction`, `refundGuestPaymentAction`.

- [ ] **Step 1: Write the failing edit tests**

```ts
import { beforeEach, expect, it } from 'vitest'
import { testDb, resetDb } from '../db'
import { createMatchForDate, updateMatch } from '@/domain/matches'
import { createMember } from '@/domain/members'
import { signup } from '@/domain/entries'
import { lockMatch } from '@/domain/lock'

beforeEach(resetDb)

it('freezes money fields after lock but allows venue', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  await lockMatch(testDb, match.id, new Date('2027-03-30T11:00:00Z'))
  expect(await updateMatch(testDb, { actorId: admin.id, matchId: match.id, now: new Date('2027-03-30T12:00:00Z'), patch: { costAgorot: 4000 } })).toEqual({ ok: false, code: 'MONEY_FIELDS_FROZEN' })
  const venue = await updateMatch(testDb, { actorId: admin.id, matchId: match.id, now: new Date('2027-03-30T12:00:00Z'), patch: { venue: 'Campo 2' } })
  expect(venue.ok).toBe(true)
})

it('refuses a capacity below the confirmed roster before lock', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const a = (await createMember(testDb, { name: 'A' })).member
  const b = (await createMember(testDb, { name: 'B' })).member
  const now = new Date('2027-03-27T10:00:00Z')
  await signup(testDb, { memberId: a.id, matchId: match.id, now })
  await signup(testDb, { memberId: b.id, matchId: match.id, now })
  expect(await updateMatch(testDb, { actorId: admin.id, matchId: match.id, now, patch: { capacity: 1 } })).toEqual({ ok: false, code: 'CAPACITY_BELOW_CONFIRMED' })
})
```

- [ ] **Step 2: Implement `updateMatch`**

Before lock: any field in the patch is allowed, but `capacity >= confirmed count`, cost positive, capacity in range. After lock: only `venue`, `kickoffAt` and `notes`; if the patch touches `costAgorot`, `capacity`, `signupOpensAt`, `guestPhaseAt` or `lockAt`, return `MONEY_FIELDS_FROZEN`. A `played` match is read-only (`MATCH_FINISHED`). The match date is never editable. Audit `match.update` with the changed keys.

- [ ] **Step 3: Build the match admin page**

Header: date, phase, spots, status, links. Sections:
- **Edit**: form for the allowed fields; disabled money fields after lock with a translated explanation.
- **Roster**: every confirmed entry with member name or guest + host; add-member form; remove button; for locked matches, remove opens a reason field. Charges appear next to members with **Waive** (reason input) and **Restore**.
- **Attendance**: list of confirmed entries with present/no-show toggles (defaults to `null` until set).
- **Guest payments**: for each guest entry, record amount (prefilled with the match cost) and show payment/refund history with a **Refund** action.
- **Cancel match**: confirm dialog with a required reason.

All controls call actions from Task 15; errors render translated codes. Attendance and refunds are disabled for cancelled matches.

- [ ] **Step 4: Verify and commit**

Run `npm test -- tests/domain/matchEdits.test.ts && npm run build`. Manually: edit pre-lock, lock by setting `lockAt` to a past time and reloading, confirm money fields lock, waive and restore a charge, record and refund a guest payment, cancel and confirm the waiver/refund.
```bash
git add src/app/admin/matches src/components/AdminRoster.tsx src/components/AttendanceList.tsx src/components/GuestPayments.tsx src/domain/matches.ts src/app/actions/admin.ts tests/domain/matchEdits.test.ts
git commit -m "feat: add admin match operations, charges and attendance"
```

---

### Task 16: Admin money page and payment reminders

**Files:**
- Create: `src/app/admin/money/page.tsx`, `src/components/MoneySummary.tsx`, `src/components/PaymentForm.tsx`, `src/components/BalanceTable.tsx`, `tests/domain/reminders.test.ts`
- Modify: `src/domain/notifications.ts` (add `sendPaymentReminder`), `src/app/actions/admin.ts`

**Interfaces:**
- Adds: `sendPaymentReminder(db, input: { actorId: number; memberId: number; now: Date }, transport: PushTransport): Promise<Result<{ sent: boolean }, 'FORBIDDEN' | 'NOT_FOUND'>>` with `category='payment_reminder'` and `eventKey = payment_reminder:{memberId}:{YYYY-MM-DDTHH:mm}` so each manual trigger sends.
- Produces actions: `recordPaymentAction`, `setExpenseAction`, `sendReminderAction`.

- [ ] **Step 1: Write the failing reminder test**

```ts
it('lets an admin send a reminder but never a member', async () => {
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const member = (await createMember(testDb, { name: 'Ana' })).member
  const transport = vi.fn().mockResolvedValue({ statusCode: 201 })
  expect(await sendPaymentReminder(testDb, { actorId: member.id, memberId: member.id, now }, transport)).toEqual({ ok: false, code: 'FORBIDDEN' })
  const ok = await sendPaymentReminder(testDb, { actorId: admin.id, memberId: member.id, now }, transport)
  expect(ok.ok).toBe(true)
})
```
This test lives in `tests/domain/reminders.test.ts` with the standard Vitest/DB imports. Add a push subscription for the member first; assert two calls a minute apart both send, and a call from a non-admin returns `FORBIDDEN`.

- [ ] **Step 2: Implement the reminder**

Verify admin, load member, build a localized `payment_reminder` payload pointing at `/bill`, and call `sendMemberNotification` with the timestamped key.

- [ ] **Step 3: Build the money page**

Month picker defaulting to the current Jerusalem month. `MoneySummary` shows charges, member collected, guest collected, expense, difference and outstanding, with a form to set/update the field rent. `BalanceTable` lists active members with balance and actions:
- **Mark paid** sends the full outstanding amount for that member (POST amount hidden).
- **Record payment** opens amount, method, note and optional target month.
- **Send reminder** (push) for members with a positive balance.

All forms call the actions and revalidate `/admin/money`. Members with a negative balance show credit. Amounts are entered in shekels and converted with `Math.round(value * 100)`.

- [ ] **Step 4: Verify and commit**

Run `npm test -- tests/domain/reminders.test.ts && npm run build`. Manually record a partial payment, verify the oldest month is credited first, set an expense, and confirm the pot difference.
```bash
git add src/app/admin/money src/components/MoneySummary.tsx src/components/PaymentForm.tsx src/components/BalanceTable.tsx src/domain/notifications.ts src/app/actions/admin.ts tests/domain/reminders.test.ts
git commit -m "feat: add admin money page, allocations and payment reminders"
```
---

### Task 17: Tick endpoint, lazy transitions and scheduler

**Files:**
- Create: `src/domain/tick.ts`, `src/app/api/tick/route.ts`, `tests/domain/tick.test.ts`
- Test: `tests/domain/tick.test.ts`

**Interfaces:**
- Consumes: `advanceMatch`, `lockMatch`, `createNextMatch`, `expireOffers`, `processDueNotifications`, `PushTransport`.
- Produces:
  - `runTick(db: Db, now: Date, transport: PushTransport): Promise<{ locked: number; matchesCreated: number; expiredOffers: number; notificationsSent: number }>`
  - `POST /api/tick` → 401 without `Authorization: Bearer ${TICK_SECRET}`; otherwise `200 { ...counts }`.

- [ ] **Step 1: Write the failing tick tests**

```ts
import { beforeEach, expect, it, vi } from 'vitest'
import { testDb, resetDb } from '../db'
import { charges, matches } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { createMatchForDate } from '@/domain/matches'
import { runTick } from '@/domain/tick'

const lockTime = new Date('2027-03-30T11:00:00Z')
beforeEach(resetDb)

it('locks once, creates the next match once and never double-charges', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  await confirmMembers(match.id, 3)
  const transport = vi.fn().mockResolvedValue({ statusCode: 201 })

  const first = await runTick(testDb, lockTime, transport)
  const second = await runTick(testDb, lockTime, transport)

  expect(first.locked).toBe(1)
  expect(second.locked).toBe(0)
  expect(first.matchesCreated).toBe(1)
  expect(second.matchesCreated).toBe(0)
  expect(await testDb.select().from(charges).where(eq(charges.matchId, match.id))).toHaveLength(3)
  const statuses = await testDb.select().from(matches).where(eq(matches.status, 'scheduled'))
  expect(statuses.map(m => m.matchDate)).toEqual(['2027-04-06'])
})

it('sends the Friday signup push once per member', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  await subscribeThreeMembers()
  const fridayNine = new Date('2027-03-26T07:00:00Z') // 09:00 +02
  const a = await runTick(testDb, fridayNine, transport)
  const b = await runTick(testDb, fridayNine, transport)
  expect(a.notificationsSent).toBe(3)
  expect(b.notificationsSent).toBe(0)
})
```
Define `confirmMembers(matchId, n)`, `subscribeThreeMembers()` and a shared `transport = vi.fn().mockResolvedValue({statusCode:201})` in the test file. `subscribeThreeMembers` creates three members, a push subscription each and enables every notification category.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/domain/tick.test.ts`
Expected: FAIL because `src/domain/tick.ts` does not exist.

- [ ] **Step 3: Implement `runTick`**

```ts
export async function runTick(db: Db, now: Date, transport: PushTransport) {
  let locked = 0, matchesCreated = 0, expiredOffers = 0
  const active = await db.select().from(matches).where(inArray(matches.status, ['scheduled', 'locked']))
  for (const match of active) {
    if (match.status === 'scheduled' && now >= match.lockAt) {
      await lockMatch(db, match.id, now)
      const [after] = await db.select({ status: matches.status }).from(matches).where(eq(matches.id, match.id))
      if (after?.status === 'locked') locked++
      const next = await createNextMatch(db, match.id)
      if (next) matchesCreated++
    } else if (match.status === 'scheduled') {
      const exp = await expireOffers(db, match.id, now)
      expiredOffers += exp.expired
    }
    await advanceMatch(db, match.id, now)
  }
  const { sent } = await processDueNotifications(db, now, transport)
  return { locked, matchesCreated, expiredOffers, notificationsSent: sent }
}
```
`locked` counts only matches whose status is `locked` after the call, so a concurrent tick that lost the race reports zero while charges stay correct. The scheduled query guarantees the match was `scheduled` when selected.

The route handler:
```ts
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${process.env.TICK_SECRET}`) return new Response('unauthorized', { status: 401 })
  const counts = await runTick(getDb(), new Date(), defaultTransport)
  return Response.json(counts)
}
```

- [ ] **Step 4: Verify the scheduler contract**

Run `npm run build`, start the app with `TICK_SECRET=secret`, and call:
```bash
curl -i -X POST http://localhost:3000/api/tick
curl -i -X POST -H 'Authorization: Bearer secret' http://localhost:3000/api/tick
```
Expected: 401 then 200 with counts. Confirm the second call creates no duplicate charges.

- [ ] **Step 5: Commit**

```bash
git add src/domain/tick.ts src/app/api/tick/route.ts tests/domain/tick.test.ts
git commit -m "feat: add idempotent tick endpoint for locks, queue and notifications"
```

---

### Task 18: PWA, push enrollment and WhatsApp copy

**Files:**
- Create: `src/app/manifest.ts`, `public/sw.js`, `public/icon-192.png`, `public/icon-512.png`, `src/components/PushSetup.tsx`, `src/app/api/push/subscribe/route.ts`, `src/lib/copy.ts`, `src/components/CopyMessage.tsx`, `tests/unit/copy.test.ts`
- Modify: `src/app/layout.tsx` (manifest metadata), `src/app/admin/matches/[id]/page.tsx`, `src/app/admin/money/page.tsx` (copy buttons)

**Interfaces:**
- Produces:
  - `manifest(): MetadataRoute.Manifest` with `name`, `short_name`, `start_url: '/'`, `display: 'standalone'`, `background_color`, `theme_color`, `icons` 192/512.
  - `POST /api/push/subscribe` (body is a `PushSubscriptionJSON`; requires a member; saves or updates by endpoint), `DELETE /api/push/subscribe` (body `{ endpoint }`).
  - `buildGroupMessage(event: 'signup_open' | 'lock_reminder' | 'bill_ready', locale: string, input: { date?: string; venue?: string; url: string; month?: string }): string`
  - `PushSetup` client component with states: unsupported, iOS-needs-install, permission denied, enabled, disabled.

- [ ] **Step 1: Write the failing copy test**

```ts
import { expect, it } from 'vitest'
import { buildGroupMessage } from '@/lib/copy'

it('includes the date and URL in every locale', () => {
  for (const locale of ['en', 'he', 'es']) {
    const msg = buildGroupMessage('signup_open', locale, { date: 'Tue 30 Mar 20:30', venue: 'Campo', url: 'https://example.test' })
    expect(msg).toContain('https://example.test')
    expect(msg).toContain('20:30')
  }
})
```

- [ ] **Step 2: Implement copy helpers and buttons**

`copy.ts` mirrors the notification copy map but produces group-chat text with an emoji and a link. `CopyMessage` takes a `text` prop, writes it with `navigator.clipboard.writeText`, and shows a transient "copied" label. Add "Copy signup message" to the admin match page and "Copy bill message" to the money page.

- [ ] **Step 3: Add manifest, icons and service worker**

`manifest.ts` returns the metadata route. Add two simple PNG icons (a green circle with a white ball glyph is enough; any tool may generate them; do not ship without the files). `public/sw.js`:
```js
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(self.registration.showNotification(data.title ?? 'Football', {
    body: data.body, icon: '/icon-192.png', data: { url: data.url ?? '/' },
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(clients.matchAll({ type: 'window' }).then((list) => {
    const open = list.find((c) => c.url.includes(url))
    return open ? open.focus() : clients.openWindow(url)
  }))
})
```

- [ ] **Step 4: Implement subscription storage and the setup UI**

`POST /api/push/subscribe`: require member, validate `endpoint`, `keys.p256dh`, `keys.auth`, call `savePushSubscription` (upsert by endpoint), return 204. `DELETE` removes by endpoint, only for the current member's row.

`PushSetup`: on mount, register `/sw.js`; if `!('PushManager' in window)`, show the iOS install hint with translated steps; a button requests permission and subscribes with `NEXT_PUBLIC_VAPID_PUBLIC_KEY` converted to `Uint8Array`, posts the subscription, and shows enabled. Add it to `/bill` under notification preferences.

Generate keys with `npx web-push generate-vapid-keys`, put the public key in both `VAPID_PUBLIC_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

- [ ] **Step 5: Verify PWA and push manually**

Run `npm run build && npm start`. In Chrome DevTools → Application: manifest present, service worker activated, app installable. On an iPhone, install to the home screen, enable notifications from `/bill`, and confirm a push sent by `sendPaymentReminder` (or a one-off script) arrives and opens the bill. Confirm the WhatsApp copy buttons produce text with the app URL.

- [ ] **Step 6: Commit**

```bash
git add src/app/manifest.ts public src/components/PushSetup.tsx src/app/api/push/subscribe/route.ts src/lib/copy.ts src/components/CopyMessage.tsx tests/unit/copy.test.ts src/app/admin src/app/layout.tsx
git commit -m "feat: add PWA manifest, push enrollment and WhatsApp copy"
```

---

### Task 19: Seed, full-week rehearsal and deployment runbook

**Files:**
- Create: `scripts/seed.ts`, `tests/domain/fullWeek.test.ts`, `README.md`, `docs/runbook.md`
- Modify: `.env.example`

**Interfaces:**
- Produces: `npm run seed` (idempotent; settings, one admin, 18 placeholder members, next Tuesday match; prints invite links once) and a green end-to-end domain test. Uses `npm run check-db` from Task 2 for connectivity checks.

- [ ] **Step 1: Write the full-week rehearsal test**

```ts
import { beforeEach, expect, it } from 'vitest'
import { testDb, resetDb } from '../db'
import { createMatchForDate } from '@/domain/matches'
import { createMember } from '@/domain/members'
import { signup, addGuest, withdraw } from '@/domain/entries'
import { joinQueue, claimOffer } from '@/domain/queue'
import { lockMatch } from '@/domain/lock'
import { monthSummary, recordGuestPayment, recordPayment, memberBalance, setMonthlyExpense } from '@/domain/billing'

beforeEach(resetDb)

it('runs one full week and settles the month', async () => {
  const match = await createMatchForDate(testDb, '2027-03-30')
  const admin = (await createMember(testDb, { name: 'Boss', role: 'admin' })).member
  const people = []
  for (let i = 0; i < 19; i++) people.push((await createMember(testDb, { name: `P${i}` })).member)

  const saturday = new Date('2027-03-27T10:00:00Z')
  for (const p of people.slice(0, 13)) await signup(testDb, { memberId: p.id, matchId: match.id, now: saturday })
  for (const p of people.slice(13, 15)) await joinQueue(testDb, { memberId: p.id, matchId: match.id, now: saturday })

  const monday = new Date('2027-03-29T11:00:00Z')
  const guest = await addGuest(testDb, { hostMemberId: people[2].id, matchId: match.id, name: 'Dani', now: monday })
  expect(guest.ok).toBe(true)

  const leaving = await withdraw(testDb, { entryId: await confirmedEntryId(match.id, people[0].id), actorMemberId: people[0].id, now: monday })
  expect(leaving.ok).toBe(true)
  const offer = await latestOffer(match.id)
  expect((await claimOffer(testDb, { entryId: offer.id, memberId: people[13].id, now: monday })).ok).toBe(true)

  const tuesdayLock = new Date('2027-03-30T11:00:00Z')
  await lockMatch(testDb, match.id, tuesdayLock)
  await recordGuestPayment(testDb, { actorId: admin.id, entryId: guest.ok ? guest.value.id : 0, amountAgorot: 3500, paidAt: tuesdayLock })
  await recordPayment(testDb, { actorId: admin.id, memberId: people[1].id, amountAgorot: 3500, paidAt: tuesdayLock, method: 'paybox' })
  await setMonthlyExpense(testDb, { actorId: admin.id, month: '2027-03', fieldCostAgorot: 20000 })

  const summary = await monthSummary(testDb, '2027-03')
  expect(summary.chargesAgorot).toBe(13 * 3500)
  expect(summary.memberCollectedAgorot).toBe(3500)
  expect(summary.guestCollectedAgorot).toBe(3500)
  expect(summary.outstandingAgorot).toBe(12 * 3500)
  expect((await memberBalance(testDb, people[1].id)).balanceAgorot).toBe(0)
})
```

Add the small helpers `confirmedEntryId` and `latestOffer` in the test file. The guest is hosted by `people[2]`, who stays on the roster, so the guest occupies its own spot through lock.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/domain/fullWeek.test.ts`
Expected: FAIL only on missing helpers/test file; the domain services should otherwise already exist.

- [ ] **Step 3: Implement the seed**

`scripts/seed.ts` loads `.env.local` with dotenv, creates settings only if missing, creates the admin from `SEED_ADMIN_NAME` (default `Admin`), creates members named from `SEED_MEMBERS` (comma-separated) or `Player 1..18`, skips existing names, creates the next Tuesday's match via `createMatchForDate`, and prints each raw invite link exactly once. Re-running must not duplicate members or matches and must not print new links for existing members.

- [ ] **Step 4: Write the runbook**

`docs/runbook.md` covers:
- DreamHost: create the database and user, enable **Remote MySQL** (or whitelist), note host/port, and the security decision about `%`.
- Local: `docker compose up -d db`, `.env.local`, `npm run db:migrate`, `npm run seed`.
- Production: create the Vercel project, set every env var (`DATABASE_URL`, `APP_URL`, `TICK_SECRET`, VAPID pair, public key), deploy, then run `npm run db:migrate` locally against production, then `npm run seed`.
- VAPID: `npx web-push generate-vapid-keys`.
- Scheduler: create a cron-job.org (or equivalent) job, `POST https://<app>/api/tick` every minute with the `Authorization: Bearer <TICK_SECRET>` header; verify 200s.
- Invites: copy links from `/admin/members` and send via WhatsApp; regenerate when a phone is lost.
- iOS: add to home screen before enabling notifications.
- Backups: DreamHost panel backups plus `mysqldump` before migrations; restore steps.
- Rollback: deploy previous Vercel build; migrations are forward-only.
- Monitoring: Vercel function logs; tick job history; a quick SQL query for stuck `scheduled` matches past `lockAt` (the lazy path should prevent them).

`README.md` links to the spec, the plan, the runbook, and lists the npm scripts.

- [ ] **Step 5: Full verification**

Run:
```bash
npm test
npm run build
npm run lint
```
Expected: all green. Then rehearse one real week in production with a single test member before inviting everyone:
1. Seed and open a match with the real dates.
2. Log in via an invite link.
3. Sign up, verify the roster and the bill page.
4. Set the match lock in the past, confirm the charge and the monthly total.
5. Record a payment and confirm the pot.
6. Cancel the test match, confirm the waiver and the audit entries.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add seed, full-week rehearsal and deployment runbook"
```




