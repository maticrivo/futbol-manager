import dotenv from 'dotenv'
import { Client } from 'pg'

dotenv.config({ path: '.env.local' })

async function main() {
  const conn = new Client({ connectionString: process.env.DATABASE_URL! })
  await conn.connect()
  try {
    const { rows } = await conn.query('SELECT version() AS version')
    console.log(rows)
  } finally {
    await conn.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
