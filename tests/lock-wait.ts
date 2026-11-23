import { setTimeout as delay } from 'node:timers/promises'
import { Client } from 'pg'

/**
 * Waits until some session is blocked on a Postgres lock and its current query
 * contains `marker`. node-postgres sends parameters separately, so markers must
 * match the statement shape (e.g. `"matches"."id" = $1`), never a bound value.
 */
export async function waitForLockWait(marker: string, timeoutMs = 3000): Promise<void> {
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
      if (rows.some(row => row.query !== null && row.query.includes(marker))) return
      if (performance.now() >= deadline) break
      await delay(10)
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for a lock wait matching ${JSON.stringify(marker)}`)
  } finally {
    await admin.end()
  }
}
