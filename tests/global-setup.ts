import { migrate } from 'drizzle-orm/mysql2/migrator'
import { createDb } from '../src/db'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test', quiet: true })

export default async function setup() {
  const db = createDb(process.env.TEST_DATABASE_URL!)
  await migrate(db, { migrationsFolder: './drizzle' })
  return async () => {
    await db.$client.end()
  }
}
