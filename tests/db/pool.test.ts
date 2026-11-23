import { describe, expect, it } from 'vitest'
import dotenv from 'dotenv'
import { createDb } from '@/db'

dotenv.config({ path: '.env.test', quiet: true })

describe('createDb', () => {
  it('registers an error listener so an idle client failure cannot crash the process', async () => {
    const db = createDb(process.env.TEST_DATABASE_URL!)
    try {
      expect(db.$client.listenerCount('error')).toBeGreaterThan(0)
    } finally {
      await db.$client.end()
    }
  })
})
