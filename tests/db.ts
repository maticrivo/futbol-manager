import dotenv from 'dotenv'
import { sql } from 'drizzle-orm'
import { createDb } from '../src/db'

dotenv.config({ path: '.env.test' })

export const testDb = createDb(process.env.TEST_DATABASE_URL!)

const tables = [
  'notificationLog',
  'notificationPrefs',
  'pushSubscriptions',
  'auditLog',
  'guestPayments',
  'paymentAllocations',
  'payments',
  'expenses',
  'charges',
  'entries',
  'matches',
  'sessions',
  'loginTokens',
  'members',
  'settings',
]

export async function resetDb() {
  await testDb.execute(sql.raw('SET FOREIGN_KEY_CHECKS=0'))
  for (const table of tables) {
    await testDb.execute(sql.raw(`TRUNCATE TABLE \`${table}\``))
  }
  await testDb.execute(sql.raw('SET FOREIGN_KEY_CHECKS=1'))
}
