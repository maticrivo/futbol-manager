# Deployment & Operations Runbook

This runbook covers setting up, deploying, operating, and monitoring the Weekly Football Manager application across local development, Neon Postgres hosting, and Vercel.

---

## 1. Neon Postgres Configuration

1. **Create the project**:
   - Create a project at [neon.com](https://neon.com) in region `eu-central-1` (Frankfurt), Postgres 17.
   - The free plan is permanent and needs no credit card: 1 GB storage per project, 100 CU-hours of compute per month, 5 GB egress, 10 branches, 6 hours of restore history.
2. **Two connection strings**:
   - **Pooled** (host contains `-pooler`) — this is `DATABASE_URL`, what the app uses. It survives Vercel's serverless connection fan-out.
   - **Direct** (no `-pooler`) — this is `MIGRATE_DATABASE_URL`. DDL through PgBouncer in transaction mode is unreliable, so migrations must use the direct host.
   - Both need `?sslmode=require`.
3. **Compute budget**:
   - Neon suspends compute after 5 minutes idle and bills only the time it runs. 100 CU-hours is roughly 400 awake-hours per month.
   - The scheduler runs every 10 minutes for this reason. **Do not return it to 1 minute**: a 1-minute tick keeps compute awake continuously (~180 CU-hours/month) and suspends the database around day 17.
   - Exceeding the CU-hour allowance suspends compute until the next billing period. It does not delete data.

---

## 2. Local Environment Setup

1. **Start Local Database**:
   ```bash
   docker compose up -d db
   ```
   This starts a local Postgres 17 container on port 5432 with databases `futbol` and `futbol_test` (initialized via `init/01-test-db.sql`).
2. **Configure Environment**:
   ```bash
   cp .env.example .env.local
   ```
   Update `.env.local` with your local values.
3. **Run Migrations**:
   ```bash
   DATABASE_URL=postgres://futbol:futbol@127.0.0.1:5432/futbol npm run db:migrate
   ```
   `drizzle-kit` reads `MIGRATE_DATABASE_URL` first, then `DATABASE_URL`; it does not load `.env` files itself, so pass the URL inline or export it.
4. **Seed Development Data**:
   ```bash
   npm run seed
   ```
   This creates default settings (if uninitialized), an admin user, 18 players, and the upcoming Tuesday match. Newly generated invite login links are output to standard out.
5. **Verify Connectivity**:
   ```bash
   npm run check-db
   ```
6. **Start Dev Server**:
   ```bash
   npm run dev
   ```

---

## 3. VAPID Keys Generation

Web push notifications require an application server VAPID keypair. Generate them with `web-push`:

```bash
npx web-push generate-vapid-keys
```

This outputs:
- **Public Key**: used for `VAPID_PUBLIC_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- **Private Key**: used for `VAPID_PRIVATE_KEY` (secret, never expose to client).
- **Subject**: an email or URL, e.g. `mailto:admin@example.com` for `VAPID_SUBJECT`.

---

## 4. Vercel Production Deployment

1. **Create Vercel Project**:
   - Connect your GitHub repository to Vercel.
   - Framework preset: **Next.js**.
2. **Configure Environment Variables in Vercel**:
   Set the following variables for the Production environment:
   - `DATABASE_URL`: Neon **pooled** connection string.
   - `MIGRATE_DATABASE_URL`: Neon **direct** connection string (used only by migrations).
   - `APP_URL`: Production public URL (e.g. `https://football.example.com`).
   - `TICK_SECRET`: High-entropy random secret string for authenticating cron tick calls.
   - `VAPID_SUBJECT`: `mailto:admin@example.com`
   - `VAPID_PUBLIC_KEY`: Generated VAPID public key.
   - `VAPID_PRIVATE_KEY`: Generated VAPID private key.
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: Identical to `VAPID_PUBLIC_KEY`.
   - Set the project's function region to **`fra1`** so functions run next to the Frankfurt database.
3. **Build & Deploy**:
   - Deploy through Vercel Git integration or `vercel --prod`.
4. **Apply Migrations and Seed to Production**:
   Run migration and seed commands locally against the production database, using the **direct** URL:
   ```bash
   MIGRATE_DATABASE_URL="<direct-url>" DATABASE_URL="<direct-url>" npm run db:migrate
   MIGRATE_DATABASE_URL="<direct-url>" DATABASE_URL="<direct-url>" APP_URL="https://football.example.com" npm run seed
   ```
   Save the printed login links from the seed output securely to distribute initial admin and player invites.

   > **Security Warning**: Printed invite links are bearer login tokens granting direct, passwordless access to member and admin accounts. Do not capture seed output in shared CI logs, chat channels, or tickets. If an invite link leaks, immediately regenerate an invite in `/admin/members` to revoke active sessions and issue a new token.

---

## 5. Background Scheduler (cron-job.org)

The application handles status transitions (lock, played), queue offer expirations, and scheduled push notifications via `POST /api/tick`.

1. **Setup Cron Job**:
   - Use [cron-job.org](https://cron-job.org) or an equivalent HTTPS cron service.
   - **URL**: `https://<APP_URL>/api/tick`
   - **Method**: `POST`
   - **Schedule**: Every 10 minutes (`*/10 * * * *`). This cadence is required by the Neon free plan's compute budget — see section 1.
   - **Headers**:
     ```
     Authorization: Bearer <TICK_SECRET>
     Content-Type: application/json
     ```
2. **Verification**:
   - Check the cron-job.org execution log to confirm HTTP 200 responses.
   - The response returns a JSON payload representing `TickCounts`:
     `{"locked":0,"matchesCreated":0,"expiredOffers":0,"notificationsSent":0}`.
3. **Recognizing a Stuck Schedule**:
   - If response codes are 401: verify `TICK_SECRET` in header and Vercel match.
   - If a scheduled match is past `lockAt` while `locked: 0` or `matchesCreated: 0` persists across ticks, verify server time, scheduler execution, and time zone settings (`Asia/Jerusalem`).
   - If cron-job.org fails repeatedly: the app provides a lazy self-healing fallback when users access match pages, but timely automated push notifications rely on the cron runner.

---

## 6. Member Invites & PWA Installation

1. **Member Onboarding & Magic Links**:
   - Admins can view and copy invite links from `/admin/members`.
   - Distribute links directly to players via WhatsApp or SMS.
   - When a link `https://<APP_URL>/login/<rawToken>` is opened, the user is authenticated and an HTTP-only session cookie (`fm_session`) is set.
2. **Lost Phone or Compromised Link**:
   - In `/admin/members`, the admin can click **Regenerate Invite** for any member.
   - This revokes all existing sessions and invalidates the previous login token for that member immediately.
3. **iOS Push Notification Prerequisite**:
   - Web Push on iOS (Safari) requires the web app to be added to the Home Screen:
     1. Open the site in Safari on iOS.
     2. Tap the **Share** button.
     3. Tap **Add to Home Screen**.
     4. Open the app from the Home Screen.
     5. Navigate to `/bill` and enable Push Notifications.

---

## 7. Backups, Restore & Rollbacks

1. **Database Backups**:
   - Neon's free plan has **no scheduled backups**. The only built-in recovery is 6 hours of restore history, so a mistake noticed the same evening can be rewound; one noticed next week cannot.
   - Until a scheduled dump exists, take a manual dump before any migration or bulk edit:
     ```bash
     pg_dump --no-owner --no-privileges -d "<direct-url>" -f backup_$(date +%Y%m%d_%H%M%S).sql
     ```
   - Automated backups to Cloudflare R2 are a known, accepted gap. R2 requires a checkout flow, so it is not card-free.
2. **Database Restore**:
   - To restore from a dump into an empty database:
     ```bash
     psql -d "<direct-url>" -f backup_YYYYMMDD_HHMMSS.sql
     ```
3. **Forward-Only Migrations**:
   - All Drizzle migrations in `drizzle/` are forward-only. Do not edit past migration files.
   - If a migration needs to be corrected, generate and apply a new migration that patches the schema forward.
   - Postgres enum values are added with `ALTER TYPE ... ADD VALUE`; do not re-create the type.
4. **Vercel Rollback**:
   - If an application code bug occurs in production, navigate to **Deployments** in Vercel, select the previous stable deployment, and click **Promote to Production** (Instant Rollback).
   - Because schema migrations are backward-compatible, rolling back application code will not corrupt database state.

---

## 8. Monitoring & Health Checks

1. **Vercel Function Logs**:
   - Monitor real-time logs in the Vercel Dashboard under **Project > Logs**.
   - Filter for `error` level to inspect unhandled errors or push dispatch failures.
2. **Tick & Job History**:
   - Monitor the cron-job.org dashboard for execution history and response latency.
3. **Stuck Match SQL Query**:
   - Check if any match is stuck in `scheduled` status despite having passed its `lockAt` time:
     ```sql
     SELECT id, match_date, status, kickoff_at, lock_at
     FROM matches
     WHERE status = 'scheduled' AND lock_at < now();
     ```
   - Columns are snake_case and timestamps are `timestamptz`, so `now()` compares correctly regardless of the session timezone.
   - If any rows appear, triggering `POST /api/tick` or visiting the match page in a browser will advance the match to `locked` and generate charges.
4. **Notification Deduplication**:
   - Notifications are recorded in `notificationLog` with a unique key `(eventKey)`.
   - Repeated ticks will never re-send duplicate notifications for the same match event.
