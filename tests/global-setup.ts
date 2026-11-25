import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDb } from '../src/db'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test', quiet: true })

export default async function setup() {
  const db = createDb(process.env.TEST_DATABASE_URL!)

  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`)
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
  await db.execute(sql`CREATE SCHEMA public`)
  await migrate(db, { migrationsFolder: './drizzle' })

  return async () => {
    await db.$client.end()
  }
}
