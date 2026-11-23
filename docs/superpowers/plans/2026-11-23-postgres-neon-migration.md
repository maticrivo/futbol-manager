# Postgres/Neon Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the application's database from MySQL to PostgreSQL on Neon's free plan without changing any domain behaviour.

**Architecture:** A straight storage-engine swap. The schema is rewritten in `pg-core`, the `mysql2` pool is replaced by `node-postgres`, and the MySQL-only query constructs (`$returningId`, `onDuplicateKeyUpdate`, `affectedRows`, `ER_DUP_ENTRY`) are ported to their Postgres equivalents. The domain layer's logic is untouched; the existing 351-test suite is the proof.

**Tech Stack:** Next.js 16, TypeScript, Drizzle ORM, `pg` (node-postgres), PostgreSQL 17 (local docker), Neon (production), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-postgres-neon-migration-design.md`

## Global Constraints

- Local database is `postgres:17`; production is Neon Free in `eu-central-1` (Frankfurt).
- Vercel functions are pinned to region `fra1`.
- Every instant column is `timestamp(..., { withTimezone: true, precision: 3, mode: 'date' })` — `timestamptz`, never bare `timestamp`.
- Money is integer agorot. Postgres `integer` caps at 2,147,483,647; validators are clamped to match.
- The cron schedule becomes `*/10 * * * *` (every 10 minutes).
- No `mysql2`, `drizzle-orm/mysql-core`, or `drizzle-orm/mysql2` may remain at the end.
- Tests run with `fileParallelism: false` against one shared database, reset by `resetDb()` between tests.
- Commits use conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`).
- **The tree does not compile between Task 2 and the end of Task 4.** Do not run the app or the test suite before Task 5; use `npx tsc --noEmit` and the checks named in each task.

## Review Focus

- **Timestamps across process timezones.** A `Date` written from a machine in Asia/Jerusalem must read back as the same instant. Bare `timestamp` would pass on Vercel (UTC) and silently shift 2–3 hours in local development. Pinned by a round-trip test in Task 5.
- **`COUNT`/`SUM` arriving as strings.** `pg` returns `bigint` aggregates as strings; `confirmedCount` is typed `Promise<number>`. Pinned by a `typeof` test in Task 5.
- **Two transactions racing the same match at `lockAt`.** MySQL's default REPEATABLE READ and Postgres's READ COMMITTED differ in what a waiting `FOR UPDATE` re-reads. Pinned by the ported concurrency tests in Task 5.
- **Duplicate-key races being swallowed.** `createNextMatch` and the notification log treat a unique violation as "someone else did it". Pinned by a concurrent-create test in Task 5.
- **`SELECT ... FOR UPDATE` through Neon's transaction-mode pooler.** All statements of a transaction must reach the same backend. Checked manually by the branch burst in Task 7.

---

### Task 1: Local Postgres infrastructure

**Files:**
- Modify: `docker-compose.yml`
- Modify: `init/01-test-db.sql`
- Modify: `.env.example`
- Local only (untracked): `.env.local`, `.env.test`

**Interfaces:**
- Produces: `postgres://futbol:futbol@127.0.0.1:5432/futbol` and `.../futbol_test` reachable on the host.

- [ ] **Step 1: Replace the compose service**

New `docker-compose.yml` — note the **new volume name**, because the existing `futbol-data` volume holds MySQL files and Postgres will refuse to initialise over them:

```yaml
services:
  db:
    image: postgres:17
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: futbol
      POSTGRES_PASSWORD: futbol
      POSTGRES_DB: futbol
      TZ: UTC
    volumes:
      - futbol-pg-data:/var/lib/postgresql/data
      - ./init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U futbol -d futbol"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  futbol-pg-data:
```

- [ ] **Step 2: Replace the init script**

`init/01-test-db.sql`:

```sql
CREATE DATABASE futbol_test;
```

- [ ] **Step 3: Update the env files**

In `.env.example` (tracked) and in `.env.local` / `.env.test` (local):

```
DATABASE_URL=postgres://futbol:futbol@127.0.0.1:5432/futbol
TEST_DATABASE_URL=postgres://futbol:futbol@127.0.0.1:5432/futbol_test
```

- [ ] **Step 4: Start and verify**

```bash
docker compose down -v
docker compose up -d db
docker compose exec db psql -U futbol -d futbol -c 'select version()'
docker compose exec db psql -U futbol -d futbol_test -c 'select current_database()'
```

Expected: Postgres 17.x, then `futbol_test`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml init/01-test-db.sql .env.example
git commit -m "chore: replace local MySQL with Postgres 17"
```

---

### Task 2: Convert the schema to pg-core

**Files:**
- Modify: `src/db/schema.ts`
- Delete: `drizzle/0000_deep_jean_grey.sql`, `drizzle/meta/*`
- Regenerate: `drizzle/`

**Interfaces:**
- Produces: `pgTable` definitions exporting the same 15 table names and 9 enum names as today.

- [ ] **Step 1: Rewrite the imports and column types**

Import from `drizzle-orm/pg-core`. The conversions:

| MySQL | Postgres |
| --- | --- |
| `mysqlTable` | `pgTable` |
| `mysqlEnum('role', [...])` | `pgEnum('member_role', [...])` |
| `int(...).autoincrement().primaryKey()` | `integer(...).generatedAlwaysAsIdentity().primaryKey()` |
| `datetime({ mode: 'date', fsp: 3 })` | `timestamp({ withTimezone: true, precision: 3, mode: 'date' })` |
| `json(...)` | `jsonb(...)` |
| `smallint(...)` | `smallint(...)` |
| `int unsigned` | `integer` |

**Enum type names must be unique across the schema** — the MySQL code reuses `'role'` and `'status'` on different tables, which Postgres rejects. Use: `member_role`, `member_status`, `match_status`, `entry_kind`, `entry_status`, `charge_status`, `payment_method`, `guest_payment_kind`, `notification_category`. Keep the exported variable names unchanged.

- [ ] **Step 2: Clamp the money validator**

`src/domain/billing.ts:293` — `setMonthlyExpense` currently accepts `fieldCostAgorot` up to `4294967295`. Change the bound to `2_147_483_647`. This is the only such validator.

- [ ] **Step 3: Regenerate the migrations**

```bash
rm -rf drizzle
npx drizzle-kit generate --name init_postgres
```

- [ ] **Step 4: Verify the generated SQL**

```bash
grep -c "CREATE TYPE" drizzle/*.sql
grep -c "GENERATED ALWAYS AS IDENTITY" drizzle/*.sql
grep -c "jsonb" drizzle/*.sql
grep -c "with time zone" drizzle/*.sql
```

Expected: `9`, `15`, `1`, and a non-zero count respectively. A `timestamp(3)` without `with time zone` means Step 1 was missed.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/domain/settings.ts drizzle
git commit -m "feat(db): convert schema to Postgres"
```

---

### Task 3: Swap the driver and migration plumbing

**Files:**
- Modify: `src/db/index.ts`
- Modify: `drizzle.config.ts`
- Modify: `tests/global-setup.ts`
- Modify: `tests/db.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `createDb(url: string, options?: { max?: number }): Db` where `Db = NodePgDatabase<typeof schema>`. `Db`, `Tx`, and `Executor` keep their names and meaning. Default `max` is `3` so existing `createDb(url)` callers keep working.

- [ ] **Step 1: Swap the dependency**

```bash
npm uninstall mysql2
npm install pg
npm install -D @types/pg
```

- [ ] **Step 2: Rewrite the pool**

`src/db/index.ts`:

```ts
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

export function createDb(url: string, options: { max?: number } = {}) {
  const pool = new Pool({ connectionString: url, max: options.max ?? 3 })
  return drizzle(pool, { schema })
}

export type Db = NodePgDatabase<typeof schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type Executor = Db | Tx
```

Keep `getDb()` as-is.

- [ ] **Step 3: Point migrations at the direct host**

`drizzle.config.ts`: `dialect: 'postgresql'`, and read the URL from `process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL`. Migrations must not run through Neon's pooler.

- [ ] **Step 4: Fix the test bootstrap**

`tests/global-setup.ts`: import `migrate` from `drizzle-orm/node-postgres/migrator`. The teardown `db.$client.end()` still works — `pg`'s `Pool` has `end()`.

`tests/db.ts`: replace the `SET FOREIGN_KEY_CHECKS` + per-table loop with one statement:

```ts
await testDb.execute(sql.raw(
  `TRUNCATE TABLE ${tables.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
))
```

- [ ] **Step 5: Apply the schema locally**

```bash
npm run db:migrate
docker compose exec db psql -U futbol -d futbol -c '\dt'
docker compose exec db psql -U futbol -d futbol -c '\dT'
```

Expected: 15 tables and 9 enum types.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/db/index.ts drizzle.config.ts tests/global-setup.ts tests/db.ts
git commit -m "feat(db): replace mysql2 driver with node-postgres"
```

---

### Task 4: Port the query layer

**Files:**
- Modify: `src/domain/entries.ts`, `lock.ts`, `members.ts`, `billing.ts`, `matches.ts`, `charges.ts`, `queue.ts`
- Modify: `src/lib/push.ts`, `src/domain/notifications.ts`, `settings.ts`
- Modify: `src/domain/matchView.ts`, `src/domain/billing.ts` (alias imports)

**Interfaces:**
- Consumes: `Db`/`Tx`/`Executor` from Task 3.
- Produces: no new public functions. Every existing signature is unchanged.

- [ ] **Step 1: `$returningId()` → `returning()` — 8 sites**

`entries.ts:95`, `entries.ts:139`, `lock.ts:98`, `members.ts:52`, `members.ts:368`, `billing.ts:91`, `billing.ts:155`, `matches.ts:217`.

Pattern: `tx.insert(x).values(...).$returningId()` becomes `tx.insert(x).values(...).returning({ id: x.id })`. Where the result is destructured as `[{ id }]`, that keeps working.

- [ ] **Step 2: `affectedRows` → `rowCount` — 3 sites**

`charges.ts:57`, `push.ts:58`, `queue.ts:102`. `pg`'s result exposes `rowCount: number | null`; use `result.rowCount ?? 0`.

- [ ] **Step 3: Upserts — 5 sites**

`.onDuplicateKeyUpdate({ set })` becomes `.onConflictDoUpdate({ target, set })` with these targets:

| File:line | Target |
| --- | --- |
| `push.ts:19` | `pushSubscriptions.endpoint` |
| `notifications.ts:41` | `[notificationPrefs.memberId, notificationPrefs.category]` |
| `settings.ts:155` | `settings.key` |
| `charges.ts:63` | `[charges.matchId, charges.memberId]` |
| `billing.ts:296` | `expenses.billingMonth` |

- [ ] **Step 4: Duplicate-key detection — 3 sites**

`notifications.ts:82`, `tick.ts:24`, `matches.ts:185`. Replace the `ER_DUP_ENTRY` / `errno === 1062` checks with Postgres SQLSTATE `23505`:

```ts
const code = (cause as { code?: string }).code
return code === '23505'
```

Keep the existing `DrizzleQueryError` unwrapping.

- [ ] **Step 5: Alias imports**

`matchView.ts` and `billing.ts` import `alias` from `drizzle-orm/mysql-core`; change to `drizzle-orm/pg-core`.

- [ ] **Step 6: Audit every `.for('update')`**

There are ~40. Each stays `for('update')`, but Postgres rejects it on the nullable side of an outer join. Run `grep -rn "for('update')" src` and check each call site for a preceding `leftJoin`. The known risky pair is `remainingSpots` (`entries.ts:38`) and anything in `matchView.ts`/`billing.ts` built on aliased joins — those are read-only paths and should not carry a row lock at all.

- [ ] **Step 7: Coerce aggregates to numbers — 3 sites**

`pg` returns `COUNT`/`SUM` as strings. Fix the three uncoerced sites:

- `entries.ts:11` → `return Number(row.total)`
- `entries.ts:38` → `Math.max(0, roster.capacity - Number(roster.occupied))`
- `matches.ts:87` → `if (patch.capacity < Number(row.total))`

`billing.ts` and `allocations.ts` already wrap aggregates in `Number(...)`.

- [ ] **Step 8: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no output. Any remaining error is a missed site from Steps 1–7.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat(db): port queries to Postgres dialect"
```

---

### Task 5: Port the test harness and get the suite green

**Files:**
- Modify: `tests/lock-wait.ts`
- Modify: `tests/domain/lock.test.ts`, `queue.test.ts`, `entries.test.ts`, `settings.test.ts`
- Modify: the 9 test files using `$returningId`
- Add tests to: `tests/db/schema.test.ts`, `tests/domain/entries.test.ts`, `tests/domain/matches.test.ts`

**Interfaces:**
- Consumes: `waitForLockWait(marker: string, timeoutMs?: number): Promise<void>` keeps its signature; only the marker strings and the introspection query change.

- [ ] **Step 1: Replace `$returningId()` in tests**

9 files: `tests/db/schema.test.ts`, `tests/domain/{notifications,billing,lock,queue,tick,entries,credit,matches}.test.ts`. Same pattern as Task 4 Step 1.

- [ ] **Step 2: Fix the direct upsert in a test**

`tests/domain/settings.test.ts:87`: `.onDuplicateKeyUpdate({ set: { value: '18' } })` → `.onConflictDoUpdate({ target: settings.key, set: { value: '18' } })`.

- [ ] **Step 3: Fix the statement-counting test**

`tests/domain/entries.test.ts`: change the import on line 2 from `drizzle-orm/mysql2` to `drizzle-orm/node-postgres`, then at line 123 drop the MySQL-only option: `drizzle(testDb.$client, { schema, mode: 'default', logger })` → `drizzle(testDb.$client, { schema, logger })`.

- [ ] **Step 4: Rewrite the lock-wait helper**

`tests/lock-wait.ts` becomes a `pg` `Client` against `TEST_ADMIN_DATABASE_URL ?? 'postgres://futbol:futbol@127.0.0.1:5432/futbol_test'`, polling:

```sql
SELECT query FROM pg_stat_activity
WHERE state = 'active' AND wait_event_type = 'Lock'
```

Match with `query.includes(marker)`. Drop the InnoDB 110 ms idle-gap dance — it exists to defeat InnoDB's snapshot refresh and has no Postgres equivalent.

- [ ] **Step 5: Rewrite the lock markers**

`node-postgres` sends parameters, so `pg_stat_activity.query` contains `$1`, never the bound value. Change the 9 call sites to value-free fragments, e.g.:

- `` `\`members\`.\`id\` = ${id}` `` → `'"members"."id" = $'`
- `` `\`matches\`.\`id\` = ${match.id} for update` `` → `'"matches"."id" = $'`
- `` `select \`role\` from \`members\` ...` `` → `'from "members"'`

Keep each marker specific enough to distinguish the statements in that test.

- [ ] **Step 6: Port the two files that drive raw connections**

`tests/domain/lock.test.ts` and `tests/domain/queue.test.ts` use `testDb.$client.getConnection()` with mysql2's `beginTransaction`/`execute`/`commit`/`rollback`/`release`. With `pg`: `const client = await testDb.$client.connect()`, `await client.query('BEGIN')`, `client.query(sql, params)`, `COMMIT`/`ROLLBACK`, `client.release()`.

- [ ] **Step 7: Add the Review Focus tests**

In `tests/db/schema.test.ts` — timestamp round-trip:

```ts
it('round-trips instants across the process timezone', async () => {
  const instant = new Date('2027-03-30T11:00:00.000Z')
  const [row] = await testDb.insert(matches).values({ /* required fields */ kickoffAt: instant, /* ... */ })
    .returning({ kickoffAt: matches.kickoffAt })
  expect(row.kickoffAt.toISOString()).toBe(instant.toISOString())
})
```

In `tests/domain/entries.test.ts` — aggregate types:

```ts
it('returns counts as numbers', async () => {
  expect(typeof await confirmedCount(testDb, match.id)).toBe('number')
})
```

In `tests/domain/matches.test.ts` — duplicate-key race is swallowed:

```ts
it('treats a concurrent successor creation as already done', async () => {
  const results = await Promise.all([createNextMatch(testDb, match.id), createNextMatch(testDb, match.id)])
  expect(results.filter(Boolean)).toHaveLength(1)
})
```

- [ ] **Step 8: Run the suite**

```bash
npm test
```

Expected: 351 tests passing. Triage any failure against this map:

| Symptom | Cause | Fix |
| --- | --- | --- |
| Value shifted by 2–3 hours | `timestamp` not `timestamptz` | Task 2 Step 1 |
| `"0120"`-style string concatenation | uncoerced aggregate | Task 4 Step 7 |
| Duplicate-key error thrown | code still `1062` | Task 4 Step 4 |
| `FOR UPDATE cannot be applied to ...` | outer join + row lock | Task 4 Step 6 |
| ID assertions failing after reset | missing `RESTART IDENTITY` | Task 3 Step 4 |

- [ ] **Step 9: Commit**

```bash
git add tests
git commit -m "test(db): port test harness to Postgres"
```

---

### Task 6: Scripts and docs

**Files:**
- Modify: `scripts/check-db.ts`
- Modify: `README.md`
- Modify: `docs/runbook.md`

- [ ] **Step 1: Rewrite `check-db.ts`**

It currently imports `mysql2/promise` and runs `SELECT VERSION()`. Use `pg`'s `Client` and `SELECT version()`, closing the client in a `finally`.

- [ ] **Step 2: Verify the scripts**

```bash
npm run check-db
npm run seed
```

Expected: a Postgres version string, then the seed summary with invite links.

- [ ] **Step 3: Update the docs**

`README.md` stack section: MySQL 8 / mysql2 → PostgreSQL 17 / node-postgres. `docs/runbook.md`: replace the DreamHost section with Neon (pooled URL for the app, direct URL for migrations), cron `*/10`, and a warning that returning the tick to 1 minute exhausts Neon's 100 CU-hour monthly allowance.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-db.ts README.md docs/runbook.md
git commit -m "docs: update runbook and scripts for Neon Postgres"
```

---

### Task 7: Neon project and first deploy

Operational, not code. No commit unless a step changes a file.

- [ ] **Step 1: Create the project**

Neon console, region `eu-central-1`, Postgres 17. Copy both connection strings: the pooled host (contains `-pooler`) for the app, the direct host for migrations.

- [ ] **Step 2: Migrate and seed production**

```bash
MIGRATE_DATABASE_URL='<direct>' DATABASE_URL='<direct>' npm run db:migrate
MIGRATE_DATABASE_URL='<direct>' DATABASE_URL='<direct>' npm run seed
```

- [ ] **Step 3: Configure Vercel**

`DATABASE_URL` = pooled URL, `MIGRATE_DATABASE_URL` = direct URL, plus `APP_URL`, `TICK_SECRET`, and the four VAPID variables. Set the project region to `fra1`.

- [ ] **Step 4: Branch burst (Review Focus #5)**

Create a Neon branch, point a preview deployment at it, and fire ~30 concurrent signups at one match. Confirm: no connection errors, no `FOR UPDATE` errors, and the roster never exceeds capacity. Record the pool `max` that survived and set it in the deployment environment.

- [ ] **Step 5: Walk the weekly cycle once by hand**

Signup → queue offer → claim → lock at `lockAt` → charges created → push delivered → admin records a payment → balance correct. Confirm the tick fires on the `*/10` schedule.

- [ ] **Step 6: Point the scheduler at the new cadence**

Update cron-job.org to `*/10 * * * *`. Confirm two consecutive runs return HTTP 200 with sensible `TickCounts`.
