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

let cached: Db | null = null
export function getDb(): Db {
  if (!cached) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
    cached = createDb(process.env.DATABASE_URL)
  }
  return cached
}
