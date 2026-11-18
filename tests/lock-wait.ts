import { setTimeout as delay } from 'node:timers/promises'
import { createConnection, type RowDataPacket } from 'mysql2/promise'

interface TransactionRow extends RowDataPacket {
  trx_query: string | null
}

export async function waitForLockWait(marker: string, timeoutMs = 3000): Promise<void> {
  // InnoDB metadata requires PROCESS; keep it off the application account.
  const admin = await createConnection(
    process.env.TEST_ADMIN_DATABASE_URL ?? 'mysql://root:root@127.0.0.1:3306/futbol_test'
  )

  try {
    const deadline = performance.now() + timeoutMs
    for (let attempt = 1; performance.now() < deadline; attempt++) {
      const [rows] = await admin.query<TransactionRow[]>(
        `SELECT trx_query FROM information_schema.innodb_trx
         WHERE trx_state = 'LOCK WAIT'`
      )
      if (rows.some(({ trx_query }) =>
        trx_query !== null && trx_query.includes(marker) && /\bfor update\b/i.test(trx_query)
      )) return

      // InnoDB refreshes this snapshot only after >100 ms without a read.
      // Leave periodic idle gaps so fast polling cannot pin a stale snapshot.
      const interval = attempt % 3 === 0 ? 110 : 10
      await delay(Math.min(interval, Math.max(0, deadline - performance.now())))
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for a FOR UPDATE lock wait matching ${JSON.stringify(marker)}`)
  } finally {
    await admin.end()
  }
}
