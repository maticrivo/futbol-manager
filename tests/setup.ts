import dotenv from 'dotenv'

dotenv.config({ path: '.env.test', quiet: true })

if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = 'test-secret'
if (!process.env.AUTH_TRUST_HOST) process.env.AUTH_TRUST_HOST = 'true'
