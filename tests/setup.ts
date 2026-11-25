import dotenv from 'dotenv'

dotenv.config({ path: '.env.test', quiet: true })

if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = 'test-secret'
if (!process.env.AUTH_TRUST_HOST) process.env.AUTH_TRUST_HOST = 'true'
if (!process.env.AUTH_GOOGLE_ID) process.env.AUTH_GOOGLE_ID = 'test-google-id'
if (!process.env.AUTH_GOOGLE_SECRET) process.env.AUTH_GOOGLE_SECRET = 'test-google-secret'
if (!process.env.AUTH_FACEBOOK_ID) process.env.AUTH_FACEBOOK_ID = 'test-facebook-id'
if (!process.env.AUTH_FACEBOOK_SECRET) process.env.AUTH_FACEBOOK_SECRET = 'test-facebook-secret'
