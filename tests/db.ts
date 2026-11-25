import dotenv from 'dotenv'
import { sql } from 'drizzle-orm'
import { createDb } from '../src/db'

dotenv.config({ path: '.env.test', quiet: true })

export const testDb = createDb(process.env.TEST_DATABASE_URL!, { max: 5 })

const tables = [
  'notification_logs',
  'notification_prefs',
  'push_subscriptions',
  'audit_logs',
  'guest_payments',
  'payment_allocations',
  'payments',
  'expenses',
  'charges',
  'entries',
  'matches',
  'session',
  'account',
  'user',
  'settings',
]

export async function resetDb() {
  await testDb.execute(sql.raw(
    `TRUNCATE TABLE ${tables.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  ))
}
