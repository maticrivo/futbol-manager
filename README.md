# Weekly Football Manager

A private web application for coordinating a recurring weekly football match, managing signups, waitlist queues, guest players, match lock transitions, push notifications, and member billing.

All monetary amounts are represented as integer agorot in Israeli New Shekels (ILS, where 100 agorot = 1 ILS).

## Stack

- **Framework**: Next.js 16 (App Router) with React 19 and TypeScript
- **Database & ORM**: PostgreSQL 17 with Drizzle ORM and `pg` (node-postgres)
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
3. **Run database migrations**:
   ```bash
   npm run db:migrate
   ```
4. **Seed initial development data**:
   ```bash
   npm run seed
   ```
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
| `seed` | `tsx scripts/seed.ts` | Seed settings, admin, player roster, and upcoming match |
| `check-db` | `tsx scripts/check-db.ts` | Test database connectivity via `DATABASE_URL` |

## Documentation

- [System Design Spec](docs/superpowers/specs/2026-11-18-weekly-football-manager-design.md)
- [Implementation Plan](docs/superpowers/plans/2026-11-18-weekly-football-manager.md)
- [Deployment & Operations Runbook](docs/runbook.md)
