import { setTimeout as delay } from 'node:timers/promises'
import { Client } from 'pg'

/**
 * Waits until at least `minWaiters` sessions are blocked on a Postgres lock and
 * their current queries contain `marker`. node-postgres sends parameters
 * separately, so markers must match the statement shape (e.g.
 * `"matches"."id" = $1`), never a bound value.
 *
 * `minWaiters` matters when several transactions share one statement shape:
 * waiting for one proves only that *some* statement is blocked, which a
 * different waiter can satisfy.
 *
 * `pg_stat_activity.query` is readable for other sessions only as a superuser
 * or a member of `pg_read_all_stats`; pointing TEST_ADMIN_DATABASE_URL at a
 * managed database without that grant turns this into an unexplained timeout.
 */
export async function waitForLockWait(marker: string, timeoutMs = 3000, minWaiters = 1): Promise<void> {
  const admin = new Client({
    connectionString: process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://futbol:futbol@127.0.0.1:5432/futbol_test',
  })
  await admin.connect()

  try {
    const deadline = performance.now() + timeoutMs
    for (;;) {
      const { rows } = await admin.query<{ query: string | null }>(
        `SELECT query FROM pg_stat_activity
         WHERE state = 'active' AND wait_event_type = 'Lock'`,
      )
      const matches = rows.filter(row => row.query !== null && row.query.includes(marker))
      if (matches.length >= minWaiters) return
      if (performance.now() >= deadline) break
      await delay(10)
    }
    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for ${minWaiters} lock wait(s) matching ${JSON.stringify(marker)}`,
    )
  } finally {
    await admin.end()
  }
}
