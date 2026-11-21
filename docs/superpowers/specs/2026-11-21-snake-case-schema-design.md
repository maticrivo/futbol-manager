# Database Naming Convention Refactoring (Plural snake_case Tables, Singular snake_case Fields) — Design

Date: 2026-11-21
Status: proposed

## Intent

Standardize the database schema naming convention across the entire application:
- **Tables**: Plural `snake_case` (e.g., `matches` -> `matches`, `auditLog` -> `audit_logs`, `notificationPrefs` -> `notification_prefs`).
- **Fields / Columns**: Singular `snake_case` (e.g., `matchDate` -> `match_date`, `kickoffAt` -> `kickoff_at`, `costAgorot` -> `cost_agorot`).
- Since existing data can be ignored, we can recreate/migrate cleanly or update the schema definition and migrations directly.

## Scope of Changes

1. **Database Schema (`src/db/schema.ts`)**:
   - Update all table names to plural `snake_case`:
     - `matches` -> `matches`
     - `members` -> `members`
     - `entries` -> `entries`
     - `charges` -> `charges`
     - `payments` -> `payments`
     - `paymentAllocations` -> `payment_allocations`
     - `expenses` -> `expenses`
     - `guestPayments` -> `guest_payments`
     - `settings` -> `settings`
     - `auditLog` -> `audit_logs`
     - `loginTokens` -> `login_tokens`
     - `sessions` -> `sessions`
     - `notificationPrefs` -> `notification_prefs`
     - `notificationLog` -> `notification_logs`
     - `pushSubscriptions` -> `push_subscriptions`
   - Update all columns across all tables to singular `snake_case` (e.g., `matchDate` -> `match_date`, `kickoffAt` -> `kickoff_at`, `signupOpensAt` -> `signup_opens_at`, `guestPhaseAt` -> `guest_phase_at`, `lockAt` -> `lock_at`, `costAgorot` -> `cost_agorot`, `createdAt` -> `created_at`, `updatedAt` -> `updated_at`, `hostMemberId` -> `host_member_id`, `guestName` -> `guest_name`, `offerExpiresAt` -> `offer_expires_at`, `billingMonth` -> `billing_month`, `waivedBy` -> `waived_by`, `waiveReason` -> `waive_reason`, `paidAt` -> `paid_at`, `targetMonth` -> `target_month`, `amountAgorot` -> `amount_agorot`, `paymentId` -> `payment_id`, `chargeId` -> `charge_id`, `actorId` -> `actor_id`, `entityId` -> `entity_id`, `queueWindowMinutes` -> `queue_window_minutes`, `kickoffTime` -> `kickoff_time`, etc.).

2. **Domain Logic, Queries & Actions**:
   - Update all Drizzle queries, inserts, updates, and selections across `src/domain/`, `src/app/actions/`, `src/lib/`, and `src/db/` to use the new snake_case property names.

3. **Seeds & Tests**:
   - Update `scripts/seed.ts`, `tests/db/`, `tests/domain/`, and all unit/integration tests to reference the snake_case column and table names.

4. **Migrations**:
   - Clean reset or new initial migration establishing the standardized naming.
