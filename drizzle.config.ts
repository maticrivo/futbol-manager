import { defineConfig } from 'drizzle-kit'

// Migrations must run against the direct (unpooled) host: DDL through
// PgBouncer in transaction mode is unreliable.
const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL

if (!url) {
  throw new Error('MIGRATE_DATABASE_URL or DATABASE_URL is not set')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url,
  },
})
