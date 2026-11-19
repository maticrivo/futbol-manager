# Deployment & Operations Runbook

This runbook covers setting up, deploying, operating, and monitoring the Weekly Football Manager application across local development, DreamHost MySQL hosting, and Vercel.

---

## 1. DreamHost MySQL Configuration

1. **Create Database & User**:
   - In the DreamHost control panel, navigate to **MySQL Databases**.
   - Create a new MySQL database (e.g. `weekly_football`) and a database user with a strong password.
   - DreamHost provides a unique hostname for your database (e.g. `mysql.example.com`). Note the default MySQL port `3306`.
2. **Remote MySQL Allowlist & Access**:
   - By default, DreamHost MySQL rejects connections outside its local web servers.
   - In **MySQL Databases > Manage MySQL User**, locate your user and add an allowlist entry under **Allowable Hosts**.
   - **Vercel Egress IPs vs `%`**:
     - *Best practice*: If using a Vercel Enterprise or team plan with fixed egress IP ranges, whitelist only those specific CIDR IP ranges.
     - *Wildcard `%` Risk*: On standard Vercel serverless plans, egress IPs rotate dynamically across AWS IP ranges. Whitelisting `%` allows connections from any IP. If `%` is used, enforce a strong, randomly generated 32+ character password for the database user, avoid using `root` or shared accounts, and restrict user privileges solely to the target database.
3. **TLS & Connection String**:
   - Format: `mysql://<username>:<password>@<dreamhost-host>:3306/<database>?ssl={"rejectUnauthorized":true}`
   - DreamHost MySQL supports SSL/TLS. Ensure connection strings use URL-encoded passwords if special characters are present.

---

## 2. Local Environment Setup

1. **Start Local Database**:
   ```bash
   docker compose up -d db
   ```
   This starts a local MySQL 8.0 container on port 3306 with databases `futbol` and `futbol_test` (initialized via `init/01-test-db.sql`).
2. **Configure Environment**:
   ```bash
   cp .env.example .env.local
   ```
   Update `.env.local` with your local values.
3. **Run Migrations**:
   ```bash
   npm run db:migrate
   ```
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
   - `DATABASE_URL`: DreamHost MySQL connection string.
   - `APP_URL`: Production public URL (e.g. `https://football.example.com`).
   - `TICK_SECRET`: High-entropy random secret string for authenticating cron tick calls.
   - `VAPID_SUBJECT`: `mailto:admin@example.com`
   - `VAPID_PUBLIC_KEY`: Generated VAPID public key.
   - `VAPID_PRIVATE_KEY`: Generated VAPID private key.
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: Identical to `VAPID_PUBLIC_KEY`.
3. **Build & Deploy**:
   - Deploy through Vercel Git integration or `vercel --prod`.
4. **Apply Migrations and Seed to Production**:
   Run migration and seed commands locally against the production database by temporarily pointing `DATABASE_URL` and `APP_URL` to production:
   ```bash
   DATABASE_URL="<production-url>" npm run db:migrate
   DATABASE_URL="<production-url>" APP_URL="https://football.example.com" npm run seed
   ```
   Save the printed login links from the seed output securely to distribute initial admin and player invites.

---

## 5. Background Scheduler (cron-job.org)

The application handles status transitions (lock, played), queue offer expirations, and scheduled push notifications via `POST /api/tick`.

1. **Setup Cron Job**:
   - Use [cron-job.org](https://cron-job.org) or an equivalent HTTPS cron service.
   - **URL**: `https://<APP_URL>/api/tick`
   - **Method**: `POST`
   - **Schedule**: Every 1 minute (`* * * * *`).
   - **Headers**:
     ```
     Authorization: Bearer <TICK_SECRET>
     Content-Type: application/json
     ```
2. **Verification**:
   - Check the cron-job.org execution log to confirm HTTP 200 responses.
   - The response returns a JSON payload summarizing actions performed:
     `{"ok":true,"now":"...","scheduleHealed":false,"advanced":0,"expiredOffers":0,"notificationsSent":0}`.
3. **Recognizing a Stuck Schedule**:
   - If response codes are 401: verify `TICK_SECRET` in header and Vercel match.
   - If `advanced: 0` persists when current time is past a match's `lockAt`: verify server time and time zone settings (`Asia/Jerusalem`).
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
   - DreamHost provides automatic automated snapshots, but always perform a manual dump prior to running new migrations:
     ```bash
     mysqldump -h <host> -u <user> -p <database> > backup_$(date +%Y%m%d_%H%M%S).sql
     ```
2. **Database Restore**:
   - To restore from a SQL dump:
     ```bash
     mysql -h <host> -u <user> -p <database> < backup_YYYYMMDD_HHMMSS.sql
     ```
3. **Forward-Only Migrations**:
   - All Drizzle migrations in `drizzle/` are forward-only. Do not edit past migration files.
   - If a migration needs to be corrected, generate and apply a new migration that patches the schema forward.
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
     SELECT id, matchDate, status, kickoffAt, lockAt
     FROM matches
     WHERE status = 'scheduled' AND lockAt < NOW();
     ```
   - If any rows appear, triggering `POST /api/tick` or visiting the match page in a browser will advance the match to `locked` and generate charges.
4. **Notification Deduplication**:
   - Notifications are recorded in `notificationLog` with a unique key `(eventKey)`.
   - Repeated ticks will never re-send duplicate notifications for the same match event.
