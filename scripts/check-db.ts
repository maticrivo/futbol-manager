import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config({ path: '.env.local' })

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!)
  const [rows] = await conn.execute('SELECT VERSION() AS version')
  console.log(rows)
  await conn.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
