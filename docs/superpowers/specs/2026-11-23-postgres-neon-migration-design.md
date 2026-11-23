# Weekly Football Manager — Postgres/Neon Migration Design

Date: 2026-11-23
Status: awaiting approval
Supersedes: the DreamHost MySQL deployment path in `docs/runbook.md`

## Intent

The application has never been deployed. Before it goes live, move its database
from MySQL to PostgreSQL hosted on Neon's free plan, so the project runs on a
host with no time limit, no credit card, no usage-based bill, and no risk of a
surprise charge.

The app itself is unchanged in behaviour. This is a storage-engine migration,
not a product change.

## What changes

One thing: where the rows live, and what speaks to them. Everything in
`src/domain/` keeps its current logic, semantics, and tests.

## Approaches considered

Free tiers were compared on 2026-11-23 from the providers' own pricing pages.

| Option | Free allowance | Verdict |
| --- | --- | --- |
| **Neon** | 1 GB/project, 100 CU-hours, 5 GB egress, 10 branches, 6h restore history + 1 snapshot, permanent, no card, no pause | **Chosen** |
| Supabase | 500 MB, 5 GB egress, no backups, pauses after 1 week idle, 2 projects | Rejected: no backups, pause risk |
| Prisma Postgres | 2 GB, 200k queries/mo | Rejected: a 1-minute tick alone exceeds 200k ops |
| Aiven PG | 1 GB, 1 CPU/1 GB RAM, no pooling, no region choice | Rejected: cannot choose region |
| Oracle Always Free VM | 2 OCPU/12 GB, 200 GB disk, 10 TB egress | Rejected: idle reclamation, no HA, we become the DBA |
| Oracle MySQL HeatWave | 50 GB managed MySQL | Rejected: private endpoint only, needs a load balancer |
| Cloudflare D1 | 5 GB, 500 MB/db, 7-day PITR | Rejected: SQLite, no interactive transactions |
| DreamHost MySQL | bundled with paid hosting | Rejected: not free, and no rehearsal needed |

Two facts decided it. Neon is the only free tier that is permanent, card-free,
never pauses, and gives back a restore window. And the app's heaviest usage is
its scheduler, which is the thing most free tiers meter — so the cron schedule
had to move to fit the cheapest tier rather than the other way round.

## Decisions made in conversation

1. **Neon Free, region Frankfurt (`eu-central-1`).** Vercel functions pinned to
   `fra1` so the app and database are in the same city.
2. **Cron moves from every 1 minute to every 10 minutes.** Verified
   consequence-free for correctness (see below), required for Neon's CU-hour
   budget.
3. **Straight to Neon. No DreamHost rehearsal, no parallel deployment, no
   rollback target.** There is no existing deployment to fall back to, so there
   is nothing to cut over from. The first production deploy is the only deploy.
4. **Port the concurrency tests properly.** They are the safety net for the
   locking and queue design; weakened coverage was rejected.
5. **Backups deferred.** Recorded as a known gap, not designed here.
6. **`pg` (node-postgres) driver**, not `@neondatabase/serverless`. One driver
   for local docker, tests, and production; transactions work; Neon's pooler
   absorbs the connection fan-out.

## Why a 10-minute tick is safe

Every mutation path guards on wall-clock time, not on match status:

- `isLocked()` (`src/domain/entries.ts:65`) is `status !== 'scheduled' || now >= lockAt`.
- It gates signup (`entries.ts:76`), withdraw (`entries.ts:112`), guest add
  (`entries.ts:128`), guest remove (`entries.ts:156`), and every queue path
  (`queue.ts:23,52,64,119`).
- Offer claims re-check `offerExpiresAt` at claim time (`queue.ts:118`).
- The UI derives "locked" from the clock (`matchView.ts:26`).
- Page loads call `advanceMatch` (`src/app/page.tsx:36`,
  `src/app/admin/matches/[id]/page.tsx:45`), so played transitions self-heal.

What shifts by up to 10 minutes: charge creation at lock, successor-week
creation, re-offering an expired offer to the next person, and push delivery.
The offer *window* is unchanged because it is an absolute timestamp; only the
hand-off to the next queued player is delayed. Queue drain is therefore up to
10 minutes slower per step.

Budget check: at 10-minute intervals Neon's compute is allowed to suspend
between ticks. ~4,320 invocations/month of a few seconds each is single-digit
CU-hours against a 100 CU-hour allowance. A 1-minute tick would keep compute
awake continuously (~180 CU-hours) and suspend the database around day 17 —
this is the constraint that set the interval.

## Migration surface

### Schema — `src/db/schema.ts`

15 tables. Conversions:

- `mysqlTable` → `pgTable`; `mysqlEnum` → `pgEnum` (9 enums: member role,
  member status, match status, entry kind, entry status, charge status, payment
  method, guest payment kind, notification category).
- `int unsigned autoincrement` → `integer generatedAlwaysAsIdentity()` (15
  primary keys). Postgres has no unsigned integers.
- `datetime({ fsp: 3 })` → `timestamp({ precision: 3, mode: 'date' })`.
- `json` → `jsonb` (`audit_logs.detail`).
- `smallint unsigned` → `smallint` (`matches.capacity`).
- Indexes and unique constraint names are preserved verbatim.
- **Money columns** stay `integer`. MySQL's `int unsigned` reached 4,294,967,295
  agorot; Postgres `integer` stops at 2,147,483,647 (≈ ₪21.4M for one match).
  `setMonthlyExpense` currently accepts up to the old ceiling, so its validator
  gets clamped to the new one. This is the single intentional behaviour change
  in the migration: an input that would have been stored now returns
  `INVALID_AMOUNT`. Recorded here rather than hidden.

This inventory is a checklist, not a proof of completeness. Phase 1 ends with a
`tsc` pass, the full suite, and a grep sweep for MySQL-isms
(`mysql-core`, `mysql2`, `onDuplicateKeyUpdate`, `$returningId`, `affectedRows`,
`ER_DUP_ENTRY`, `information_schema.innodb_trx`).

### Query layer

- **8 `$returningId()`** → `.returning({ id: table.id })`:
  `entries.ts:95,139`, `lock.ts:98`, `members.ts:52,368`,
  `billing.ts:91,155`, `matches.ts:217`.
- **3 `result.affectedRows`** → `result.rowCount`:
  `charges.ts:57`, `push.ts:58`, `queue.ts:102`.
- **5 `.onDuplicateKeyUpdate()`** → `.onConflictDoUpdate({ target, set })`:
  `push.ts:19` (endpoint), `notifications.ts:41` (memberId+category),
  `settings.ts:155` (key), `charges.ts:63` (matchId+memberId),
  `billing.ts:296` (billingMonth).
- **3 duplicate-key detectors** `ER_DUP_ENTRY`/`1062` → Postgres `23505`:
  `notifications.ts:82`, `tick.ts:24`, `matches.ts:185`.
- **~40 `.for('update')`** calls stay as-is. Postgres supports `FOR UPDATE`,
  but each site must be audited for joins — Postgres rejects `FOR UPDATE` on
  the nullable side of an outer join. `alias` imports in `matchView.ts` and
  `billing.ts` move from `mysql-core` to `pg-core`.

### Infrastructure

- `src/db/index.ts`: `mysql2` pool → `pg` `Pool` + `drizzle-orm/node-postgres`.
  Pool size becomes a parameter (see "Test pool vs. serverless pool"); add a
  short idle timeout.
- `drizzle.config.ts`: `dialect: 'postgresql'`. Migrations must run against
  Neon's **direct** (unpooled) host, not the `-pooler` host.
- `drizzle/`: delete the MySQL migration and regenerate from the new schema.
- `docker-compose.yml`: `mysql:8.0` → `postgres:17`, with a healthcheck.
- `init/01-test-db.sql`: replace with a Postgres init script that creates
  `futbol_test` (`CREATE DATABASE` cannot run inside a transaction block).
- `tests/global-setup.ts`: `drizzle-orm/mysql2/migrator` →
  `drizzle-orm/node-postgres/migrator`.
- `tests/db.ts`: `SET FOREIGN_KEY_CHECKS=0` + per-table `TRUNCATE` → a single
  `TRUNCATE ... RESTART IDENTITY CASCADE`.
- `.env.example`, `.env.test`: `postgresql://` URLs; add
  `MIGRATE_DATABASE_URL` for the direct host.
- `scripts/check-db.ts`: **rewrite** — it imports `mysql2/promise` and runs
  `SELECT VERSION()`. `scripts/seed.ts` is dialect-agnostic and needs only a
  smoke run.
- `README.md`: still documents MySQL/mysql2; update the stack section.
- `docs/runbook.md`: DreamHost section → Neon section; cron schedule `*/10`.

### Test infrastructure (the part that is not mechanical)

The concurrency tests are the safety net for the locking design and they are
built on MySQL introspection, not on portable SQL:

- `tests/lock-wait.ts` polls `information_schema.innodb_trx` and matches
  backticked MySQL SQL text.
- `lock.test.ts`, `queue.test.ts`, `auth.test.ts` drive
  `testDb.$client.getConnection()` with mysql2's `beginTransaction` /
  `execute` / `commit` / `rollback` / `release`.
- `entries.test.ts:123` builds a second Drizzle instance from `testDb.$client`
  to count statements.
- Lock markers assert bound values in the SQL text (e.g. `` `members`.`id` = 5 ``);
  Postgres exposes parameters as `$1` in `pg_stat_activity`, so those
  assertions cannot survive as written.
- 9 test files use `$returningId`, and `tests/domain/settings.test.ts:87`
  calls `.onDuplicateKeyUpdate()` directly.

Porting these needs a `pg_locks` / `pg_stat_activity` helper and rewritten
assertions. This is roughly half a day of test engineering, not a find-and-
replace, and it is the main reason the "behaviour is unchanged" claim is worth
anything.

### Test pool vs. serverless pool

`createDb` is shared by the app and the tests. The concurrency tests hold one
pool connection while running two concurrent transactions, so a `max: 1` pool
deadlocks them. Pool size must therefore be a parameter, not a constant:
tests keep headroom (5), production starts at 3 and is tuned in Phase 2.

No data migration. There is no prior deployment and no production database, so
there is nothing to convert, export, or reconcile.

## Sequencing

**Phase 1 — Migration (a day and a half to two days).** Everything in "Migration
surface", including the concurrency-test port, until the full Vitest suite is
green against local `postgres:17`. Ends with the grep sweep.

**Phase 2 — Neon and first deploy.** Create the project in `eu-central-1` and run
migrations and seed against the direct host. Validate on a Neon branch first: a
short concurrent-signup burst to settle the pool size and confirm the app
survives Vercel's instance fan-out. Then point production at the main branch,
deploy with functions in `fra1`, cron `*/10`, and walk the full weekly cycle once
by hand.

**Phase 3 — Backups (deferred, not designed here).** Until this exists, the only
recovery window is Neon's 6-hour restore history on the free plan. A mistake
noticed the same evening is recoverable; one noticed next week is not. Recorded
as a known gap rather than dropped.


## Non-goals

- No change to authentication, sessions, or invite tokens.
- No ORM change (Drizzle stays) and no schema redesign.
- No new features, no UI changes, no i18n changes.
- No Supabase, Prisma, Cloudflare D1, or Oracle adoption.
- No change to the tick's logic — only its schedule.

## Anti-goals

- Rewriting `src/domain/` logic to suit the database.
- Skipping the concurrency-test port to save half a day.
- Reaching production without a tested backup restore.

## Risks and constraints

- **CU-hour budget.** 100 CU-hours is roughly 400 awake-hours. The 10-minute
  interval is the safety margin; a future move back to 1 minute would suspend
  the database mid-month. This belongs in the runbook as a warning.
- **No `FOR UPDATE` with outer joins.** The audit may force one or two queries
  to be restructured; this is the most likely source of surprises in Phase 1.
- **Pooler vs direct.** DDL through PgBouncer transaction mode is unreliable;
  migrations must use the direct host.
- **Free-tier terms change.** Oracle halved its Arm allowance; Neon's free plan
  could change too. Mitigation is a portable schema, and — once Phase 3 exists —
  a dump.
- **No HA.** A Neon outage is downtime. Accepted for this app.
- **Backups are deferred.** Until Phase 3, recovery is limited to Neon's
  6-hour restore history. Accepted knowingly.
- **Blast radius of a bad migration.** The app is a ledger, not a payment
  system: no money moves through it, there is no card data and no transfer to
  protect. `charges` records what each confirmed player owes, `payments` and
  `payment_allocations` record what an admin saw arrive in the Paybox group and
  which month it credits, `guest_payments` records cash collected on the night,
  and `expenses` holds the monthly field rent so the pot can be computed. A bug
  produces a wrong balance shown to a player, not a lost transaction — and
  payments are append-only with corrections as negative adjustments, which caps
  the damage. The tests that matter most are therefore the queue and lock ones:
  a race there decides *who gets charged*, and wrong charges are what feed the
  ledger.

## What is left to the builder

- The exact `pgEnum` vs `text` + `CHECK` choice is settled below, but the
  migration's `CREATE TYPE` ordering is the builder's to arrange.
- Whether `pg`'s pool needs `max: 1` per serverless instance rather than 3 is a
  measurement, not a guess — decide it in Phase 2 against a Neon branch.
- The concurrency-test port is scoped in "Test infrastructure" but the exact
  `pg_locks` assertions are the builder's to design.
- The backup destination, when Phase 3 is picked up, is the partner's call
  (Cloudflare R2 needs a checkout flow; GitHub Actions artifacts do not).

## Calls made in this document (partner may veto)

- **`pg` over `@neondatabase/serverless`** — one driver everywhere beats a
  marginally faster cold path.
- **`generatedAlwaysAsIdentity()` over `serial`** — the modern form, and it
  matches the existing `autoincrement` semantics.
- **`pgEnum` over `text` + `CHECK`** — keeps database-level validation, which
  the MySQL schema had.
- **Keep the tick's logic, change only its schedule** — the alternative, making
  the tick cheap enough for a 1-minute interval, is more work for no product
  gain.
- **Port the concurrency tests rather than weaken them** — half a day of test
  engineering buys the only real coverage of the queue and lock design, which is
  what decides who gets charged.
- **Defer backups** — accepted gap, with Neon's 6-hour restore history as the
  only current safety net.
