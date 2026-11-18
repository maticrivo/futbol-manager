import mysql from 'mysql2/promise'
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2'
import * as schema from './schema'

export function createDb(url: string) {
  const pool = mysql.createPool({ uri: url, connectionLimit: 3, enableKeepAlive: true, timezone: 'Z' })
  return drizzle(pool, { schema, mode: 'default' })
}

export type Db = MySql2Database<typeof schema>
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
