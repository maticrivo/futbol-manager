# Weekly Football Manager — Design

**Date:** 2026-11-18
**Status:** Draft for approval
**Author:** Matias Crivolotti (with agent)

## Intent

A small private web app for a group of friends who play football every Tuesday.
It replaces the weekly scramble and the spreadsheet with two things:

1. A fair, time-boxed signup for 14 weekly spots, including a queue for the
   five or so members who miss out each week.
2. A monthly money account: every member owes ₪35 per match they were
   committed to, guests pay on the night, payments are tracked, and the group
   can see whether the pot covers the field rent.

The group collects money through a Paybox group and pays the field monthly
from that pot. The app never moves money; it records who is committed, who
paid, and what the month adds up to.

## Users

- **Members** — currently 19. Sign up, join the queue, add guests after the
  guest phase opens, see their own bill and payment history.
- **Guests** — no accounts. A guest is a named entry attached to the member
  who brings them. That member is responsible for the guest's ₪35 on the
  night.
- **Admins** — the owner plus a small number of trusted members. They create
  and cancel matches, manage members, override charges, record payments,
  mark attendance and guest payments, and configure the app.

## Weekly cycle (all times Asia/Jerusalem)

| Time | What happens |
|------|--------------|
| Friday 00:00 | Signup opens for members. 14 spots, first come first served. |
| Friday 09:00 | Push (and WhatsApp text prepared) "signup is open". |
| Monday 14:00 | If spots remain, the guest phase opens. Members can still sign up, and any member can add named guests. |
| Tuesday 12:30 | Push "roster locks at 14:00". |
| Tuesday 14:00 | Roster locks. Each member on it is charged ₪35. Queue and pending offers dissolve. |
| Tuesday evening | Match. Admin marks attendance and guest payments afterwards. |
| 1st of the month | Push "last month's bill is ready". |

Times, capacity, cost, venue and kickoff are settings; ₪35 and 14 are the
defaults. The app auto-creates the next Tuesday match from those defaults;
an admin can edit it or cancel a week (holiday).

## Signup rules

- Members only during the member phase. A member occupies one spot.
- When all 14 spots are taken, the signup button becomes **Join queue**.
- A member may withdraw until the lock. Withdrawing frees the spot and
  starts the queue.
- After Monday 14:00, freed spots still go to the queue first; only when the
  queue is empty does a spot open publicly to members and guests.
- Before Monday 14:00, a queue-empty freed spot returns to the members-only
  pool; guests cannot fill it.
- Guests may only be added from Monday 14:00 onwards. One member may add
  several guests if spots remain.
- After lock, the roster cannot change through the normal flow. An admin can
  edit it, and every edit is logged.

## Queue

- Opt-in, FIFO. Joining puts you at the back; leaving is always allowed.
- When a spot frees, the first member in the queue receives a push with a
  one-tap **Claim** button and has an exclusive window of 30 minutes
  (admin-configurable).
- No answer or pass → the offer expires and moves to the next member.
- The offer is tied to the freed spot; if two spots free, two offers can run
  in parallel.
- Queue dissolves at lock; any pending offer is void.

## Charges and overrides

- At lock, every member on the roster gets a ₪35 charge for that match.
  Being on the roster is the commitment; no-shows are charged.
- An admin can waive a charge with a required reason. The main case: the
  member found a substitute in time. The substitute is added as the guest
  of a member (normally the absent member), pays on the night, and the
  absent member's charge is waived.
- Waivers are visible in an audit log with actor, time and reason.
- Attendance (present / no-show) is recorded by an admin after the match.
  It is a record and does not change billing.

## Money

### Member bill

- Billing months are calendar months, and a match belongs to the month of its
  kickoff date.
- A member's bill for a month is the sum of their charges for that month's
  matches.
- Unpaid balances do not disappear at month end. They carry forward and show
  as an outstanding balance on the member's page and the admin payment view.

### Payments

- Admins record payments against a member: amount, date, method
  (Paybox / cash / other), and optional note.
- **Mark paid** records the full outstanding amount; a partial payment can be
  entered with a custom amount.
- Each member sees their own history: charges per match, payments, balance.
- A member's balance is `charges − payments` across all months.

### Guests

- Guests are not billed in the app. The host member collects the ₪35 on the
  night.
- An admin marks a guest as paid on the match page.
- Guest payments count toward the pot, never toward the host's bill.

### Pot

- Per month, the admin enters the field rent once.
- The pot card shows: collected this month (member payments recorded with
  that billing month + guest payments for matches in that month) against the
  field rent, and whether the month is covered.
- Timing is not enforced: it is normal for the rent to leave the pot before
  all members settle.

## Notifications

Web Push, free, via VAPID and a service worker. On iPhone this requires
adding the app to the home screen; the app will show a one-time install
hint. Push is a convenience, never a dependency — nothing breaks if someone
never enables it.

Categories, each toggleable per member:

- Signup opened (Friday 09:00)
- Guest phase opened (Monday 14:00)
- Lock reminder (Tuesday 12:30)
- Queue offer (immediate, actionable)
- Bill ready (1st of the month)
- Admin payment reminder (admin-triggered, to members with a balance)

All scheduled notifications are deduplicated by a unique key in a
notification log, so a retried or duplicated tick never double-sends.

**WhatsApp fallback:** the admin screens include a "Copy message for the
group" action that produces short text with the app link (signup open,
lock reminder, bill ready), so the existing WhatsApp group keeps working
without push.

## Languages

Hebrew, English and Spanish, from day one. The browser language picks the
default; the member can override it in settings. Hebrew renders right to
left. Dates, numbers and currency follow the chosen locale (₪35 / 35 ₪ /
35 ILS as appropriate).

## Access and accounts

- No passwords. An admin adds a member and generates a personal invite link,
  shared over WhatsApp. The link sets a long-lived session cookie.
- Links are random, stored hashed, and can be revoked or regenerated by an
  admin if a phone is lost or a member leaves.
- Admins are members with the admin role. Admin actions that affect money or
  the roster are logged.
- Guests never log in.

## Approaches considered

**A. Next.js + Postgres on Vercel, free tiers.** One codebase for UI and API,
PWA and i18n well supported, small external scheduler for timed jobs.
Chosen, with MySQL on the group's existing DreamHost server instead of
Postgres: no new database cost, and the data lives on a server the group
already owns. Trade-off: Vercel functions reach the database over the
public internet, so remote MySQL access must be enabled and the connection
count kept small.

**B. Always-on server (Next or SvelteKit + SQLite) on a cheap VPS.**
Simplest scheduling and operations, but costs money monthly and puts
patching on the group.

**C. Cloudflare Workers + D1.** Free and always on with built-in cron, but the
most unusual stack; Web Push and the UI framework need custom glue, and the
result is harder to hand over.

## Architecture

- **App:** Next.js (App Router), TypeScript, mobile-first. PWA with manifest
  and service worker for install and push. Tailwind CSS and a small
  component set.
- **Hosting:** Vercel Hobby (free).
- **Database:** MySQL 8 on DreamHost, via Drizzle ORM and `mysql2`.
  TLS if the server supports it; otherwise a documented exception. Pool cap
  of 3 connections per function instance, short idle timeout, no long
  transactions. Migrations run explicitly, not on deploy.
- **Scheduling:** an idempotent `POST /api/tick` endpoint protected by a
  secret, called every minute by a free external scheduler (cron-job.org or
  equivalent). The tick performs phase transitions, queue-offer expiry and
  scheduled pushes. Every request also performs cheap lazy transitions, so
  correctness never depends on the ticker.
- **Concurrency:** capacity checks and queue claims run in transactions with
  row locks; unique constraints (`match + member` charge, `match + member`
  entry) make double-charging and double-booking impossible.
- **Time:** stored UTC, rendered in Asia/Jerusalem, DST handled with a
  timezone library.
- **Web Push:** `web-push` with VAPID keys; subscriptions stored per device.
- **i18n:** `next-intl`; locales `he`, `en`, `es`; RTL support.
- **Secrets:** database credentials, VAPID keys, tick secret and session
  secret in Vercel environment variables.
- **Backups:** DreamHost's database backups plus a documented manual dump
  before schema changes.

## Data model (sketch)

- `members` — name, role (member/admin), locale, status, created_at
- `login_tokens` — member_id, token_hash, revoked_at, last_used_at
- `sessions` — member_id, token_hash, expires_at, user agent
- `matches` — kickoff_at, venue, cost_per_player, capacity, signup_opens_at,
  guest_phase_at, lock_at, status (scheduled/locked/played/cancelled)
- `entries` — match_id, kind (member/guest), member_id or guest_name +
  host_member_id, status (confirmed/queued/offered/withdrawn/expired/
  removed), created_at, offered_at, offer_expires_at
- `charges` — match_id, member_id, amount, status (charged/waived),
  waived_by, waive_reason, unique (match_id, member_id)
- `payments` — member_id, amount, billing_month, paid_at, method,
  recorded_by, note
- `guest_payments` — entry_id, amount, paid_at, recorded_by
- `expenses` — billing_month, field_cost
- `push_subscriptions` — member_id, endpoint, keys, user agent
- `notification_prefs` — member_id, category, enabled
- `notification_log` — unique key, sent_at
- `settings` — key/value
- `audit_log` — actor, action, entity, detail, created_at

## Edge cases and rules

1. Two members claim the last spot simultaneously: one transaction wins; the
   other sees the roster full and may join the queue.
2. A queue offer is exclusive. It either converts to a confirmed entry or
   expires; expiry immediately offers the spot to the next member.
3. An offer expires at lock time: it is void. Nothing is charged for it.
4. A member cannot withdraw after lock. Only an admin waiver can change the
   bill, with a reason.
5. A cancelled match produces no charges, voids all entries, and suppresses
   its notifications.
6. A week with fewer than 14 players proceeds normally.
7. A member who misses the signup is never charged for a match they were not
   confirmed into.
8. Guests and members share the 14 spots. A guest takes a spot like anyone.
9. Same guest name can appear more than once; guests are just names.
10. Disabling a member keeps their history and balance; they cannot log in or
    sign up.
11. The tick and the lazy transitions must be safe to run repeatedly and
    concurrently; all state changes are idempotent.
12. Each notification is sent at most once per member and event.
13. Wrong or duplicated timezone handling must never move a lock time. All
    lock/phase times are computed from the match row, not from the server's
    local time.

## Non-goals

- No payment processing or Paybox integration. The app records.
- No team selection, positions, or match statistics beyond attendance.
- No chat; WhatsApp remains the conversation.
- No native iOS/Android apps.
- No support for multiple groups or leagues; one group, one weekly match.
- No automatic debt chasing messages; admins trigger reminders.

## Anti-goals

- A member who withdrew before lock must never be charged.
- A player must never be double-booked or double-charged.
- Times must not silently shift with DST or server timezone.
- No money or roster change without a traceable record.
- The app must not break if push notifications are unavailable.

## Risks and constraints

- **DreamHost remote MySQL:** must be enabled and reachable from Vercel.
  Verify before building further. If Vercel cannot reach it, fallback is a
  small same-app runtime or proxy on DreamHost; the data model is unchanged.
- **Serverless + MySQL connection limits:** keep pools tiny, queries short,
  avoid long transactions. At this scale (19 users, a few hundred rows a
  month) load is negligible.
- **iOS push:** only after installing to the home screen. Mitigated by the
  WhatsApp copy action.
- **Single maintainer:** keep the stack conventional and documented.

## What is left to the builder

- Visual design and component choices within the mobile-first PWA.
- Exact copy in the three languages.
- Concrete Drizzle schema and migration files.
- The scheduler provider choice and deployment runbook.
- Test plan: unit tests for lock/charge/queue rules, integration tests
  against a test database, and a manual rehearsal of one full week.
- Seeding the real members and the first match.

## Calls made in this document (partner may veto)

- Signup opens at Friday 00:00, announcement push at Friday 09:00.
- Lock at Tuesday 14:00; reminder at 12:30.
- Queue window 30 minutes, configurable; queue offers run in parallel when
  multiple spots free.
- Matches auto-created weekly from defaults; admin can cancel or edit.
- Charges are created at lock; attendance is a record only.
- Payments are a ledger with partial payments supported; balances carry
  across months.
- Pot card with manually entered monthly field rent.
- Guests may be added by any member, not only the host member of a spot.
- WhatsApp copy action included as a push fallback.
- The app is one group only; no multi-tenancy.
