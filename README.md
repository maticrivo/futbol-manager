# Weekly Football Manager

A private web application for coordinating a recurring weekly football match, managing signups, waitlist queues, guest players, match lock transitions, push notifications, and member billing.

All monetary amounts are represented as integer agorot in Israeli New Shekels (ILS, where 100 agorot = 1 ILS).

## Stack

- **Framework**: Next.js 16 (App Router) with React 19 and TypeScript
- **Database & ORM**: PostgreSQL 17 with Drizzle ORM and `pg` (node-postgres)
- **Authentication**: Auth.js v5 (NextAuth) with the Drizzle adapter; Google and Facebook sign-in
- **Styling**: Tailwind CSS v4
- **Date & Time**: Luxon (primary timezone: `Asia/Jerusalem`)
- **PWA & Notifications**: Web Push with Service Worker (`web-push`)
- **Testing**: Vitest

## Local Quickstart

1. **Start the local Postgres database**:
   ```bash
   docker compose up -d db
   ```
2. **Copy the environment configuration**:
   ```bash
   cp .env.example .env.local
   ```
   Fill in `AUTH_SECRET`, the Google/Facebook OAuth credentials, and `ADMIN_EMAIL`. Register these callback URLs with each provider:
   - `http://localhost:3000/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/facebook`
3. **Reset and migrate the database**:
   ```bash
   export DATABASE_URL=postgres://futbol:futbol@127.0.0.1:5432/futbol
   psql "$DATABASE_URL" -c 'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;'
   npm run db:migrate
   ```
4. **Seed the admin and first match**:
   ```bash
   npm run seed
   ```
   The admin is created from `ADMIN_EMAIL`; players sign themselves up with Google or Facebook and wait for approval.
5. **Start the Next.js development server**:
   ```bash
   npm run dev
   ```

## Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `next dev` | Start local development server |
| `build` | `next build` | Create production build |
| `start` | `next start` | Run production server |
| `test` | `vitest run` | Run automated test suite with Vitest |
| `lint` | `eslint` | Run ESLint code checks |
| `db:generate` | `drizzle-kit generate` | Generate Drizzle migration files from schema |
| `db:migrate` | `drizzle-kit migrate` | Apply pending Drizzle migrations to database |
| `seed` | `tsx scripts/seed.ts` | Seed settings, the `ADMIN_EMAIL` admin, and the upcoming match |
| `check-db` | `tsx scripts/check-db.ts` | Test database connectivity via `DATABASE_URL` |

## Documentation

- [System Design Spec](docs/superpowers/specs/2026-11-18-weekly-football-manager-design.md)
- [Social Login Design](docs/superpowers/specs/2026-11-25-social-login-design.md)
- [Deployment & Operations Runbook](docs/runbook.md)
- [Member App Install & Notifications Guide](docs/member-app-install-guide.md)
