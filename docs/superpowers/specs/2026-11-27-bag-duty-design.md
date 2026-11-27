# Bag Duty ("¿Quién se lleva el bolso?") — Design

Issue: https://github.com/maticrivo/futbol-manager/issues/1

## Intent

Every week one member of the group takes the equipment bag home. Today that is
coordinated by hand in the group chat. The app should propose who takes it, from
the members who are actually playing that week, and keep the rotation fair.

The rotation is based on what actually happened, not on what was proposed: after
the match an admin records who really took the bag. A proposal that nobody
corrected counts as the assigned member having taken it.

## Goals

- One hour before kickoff, automatically assign a member and a backup from the
  match's confirmed members.
- Random, but fair: nobody takes it again before everyone eligible has taken it
  once, whenever the same group keeps signing up.
- Show the assignment to members and notify them with a push.
- Let an admin record who actually took the bag after the match, and correct it.
- Never draw twice for the same match, even with concurrent ticks or page loads.

## Non-goals

- No pre-match override of the assignment. The admin's only manual edit is the
  post-match record; the backup steps in on the night and the record reflects it.
- No bag inventory, location or return tracking.
- No more than one chore (no generic `chores` table).
- Guests are never eligible.

## Constraints (from the existing app)

- Kickoff is 20:00, sign-ups lock at 14:00 (`weekSchedule`). The 19:00 draw
  therefore happens after the roster is frozen; late sign-ups cannot affect it.
- The tick runs every 10 minutes (`POST /api/tick`); timed transitions also run
  lazily on page load via `advanceMatch`. The draw must tolerate both.
- Notifications are opt-out per category and deduplicated by
  `(eventKey, memberId)` in `notification_logs`.
- Member-facing copy exists in Hebrew, English and Spanish; admin edits are
  audit-logged.
- Times are handled in `Asia/Jerusalem`.

## Approaches

- **A. Nullable columns on `matches`** — smallest migration, but blurs the
  scheduling/pricing row (patched through a validated key whitelist) with a duty
  that has its own lifecycle, and makes history a full scan of `matches`.
- **B. Dedicated `bag_duties` table, one row per match** — chosen. Assignment and
  the admin record stay first-class facts with their own timestamps; fairness is
  a small join; the unique match key makes the draw idempotent; cancelled and
  unmarked matches are handled explicitly.
- **C. Generic `chores` table** — rejected: one chore today, and every query and
  screen would carry a `kind` filter.

## Design

### Schema — `bag_duties`

| column | type | notes |
| --- | --- | --- |
| `id` | identity int | |
| `match_id` | int, not null, unique | FK `matches.id`, cascade |
| `assigned_member_id` | text, not null | FK `user.id` |
| `backup_member_id` | text, null | FK `user.id` |
| `actual_member_id` | text, null | FK `user.id`; admin record |
| `assigned_at` | timestamptz, not null | when the draw ran |
| `recorded_by` | text, null | FK `user.id` |
| `recorded_at` | timestamptz, null | |
| `created_at`, `updated_at` | timestamptz | house style |

A row exists only when a draw happened and at least one member was eligible, so
"no draw" is simply "no row". New enum value `bag_duty` in
`notification_category` (`ALTER TYPE ... ADD VALUE`, no data writes in the same
migration).

### Credit rule (fairness)

For a candidate member at time `now`:

```
credit(member) = max(kickoff_at) over bag_duties
                 join matches on match_id
                 where coalesce(actual_member_id, assigned_member_id) = member
                   and matches.status <> 'cancelled'
                   and matches.kickoff_at < now
```

Computed at read time, `null` meaning "never". Read-time `coalesce` means:
- an unmarked past match credits its assigned member (the "admin forgot" rule);
- a later correction changes only future draws.

The current match never counts (its kickoff is in the future at draw time).

### Draw — `ensureBagDuty(db, { matchId, now, random? })`

- Skip if the match is cancelled or played, or `now < kickoff_at − 60 min`.
- Eligible = entries of `kind = 'member'`, `status = 'confirmed'` for that match.
- Pick uniformly at random among the eligible members with the oldest credit
  (never-credited sorts first). Ties are broken by the injected `random`
  function (`Math.random` by default) so tests can control it.
- Backup: the same rule over the remaining eligible members; omitted when only
  the assignee remains.
- Insert with `onConflictDoNothing` on `match_id`; only the inserting caller
  notifies. Called from the tick loop and from `advanceMatch` (lazy, no push).

Fairness emerges from least-recently-credited: with a stable group everyone
rotates once before anyone repeats; with absences, the person who has waited
longest among those playing gets it.

### Notification

- New category `bag_duty` (default enabled), rendered automatically in
  notification preferences; label added to all three locales.
- At draw time, one push per confirmed member, `eventKey = bag_duty:match:<id>`,
  through `sendMemberNotification` (honours opt-out, inactive members and the
  dedupe log). Sent by the tick, so a lazy page-load draw is still announced on
  the next tick.
- Copy: `{{name}} takes the bag this week. Backup: {{backup}}.` Backup renders
  `—` when there is none.

### Member UI

`getMatchView` gains `bagDuty` (assigned/backup/actual with display names).
A `BagDutyPanel` card under `MatchCard` on `/` shows, once a row exists:

```
Bolso de esta semana   Martín (backup: Ana)
Bolso de esta semana   Martín — lo llevó Martín   (after the record)
```

Hidden before the draw and for cancelled matches. Copy added to `match.bag.*`
in he/en/es.

### Admin UI and action

On `/admin/matches/[id]`, a `BagDutyForm` section shows assignment, backup and
record, with a select of the match's confirmed members plus "no one" and a save
button. Enabled from kickoff onward; still editable after `played`.

`recordBagDutyAction` → `recordBagTaker(db, { actorId, matchId, memberId|null, now })`:
admin-only, match not cancelled, `now >= kickoff_at`, member must be confirmed
on that match (or null), writes `actual_member_id`, `recorded_by`, `recorded_at`
and an audit entry `bag.record` with the previous value. Re-recording is
allowed. Error codes: `FORBIDDEN`, `NOT_FOUND`, `TOO_EARLY`, `NOT_IN_ROSTER`,
`MATCH_CANCELLED` (messages in all locales).

### Tick

`runTick` draws for each active match before processing notifications, then
sends any unsent `bag_duty` pushes. `TickCounts` gains `bagDuties` (rows
created). Drawing before the existing transition loop is safe because the
eligible roster is already final at draw time.

### Tests

- Credit helper: `actual` beats `assigned`; unmarked uses `assigned`; cancelled
  and future matches ignored; never-credited first.
- Draw: never-credited chosen; uniform pick among ties via injected RNG;
  backup is the next by the same rule; single member → no backup; idempotent on
  repeated/concurrent calls; no row when nobody is eligible; skipped before
  `kickoff − 1h`, for cancelled and for played matches.
- Record: admin only, too early, non-roster member, "no one", re-edit + audit.
- Notification: opt-out respected, deduped, backup-less copy.
- Tick: creates the row once and reports it in `TickCounts`.
- `getMatchView` exposes the duty with names.

## Rollout

Only matches created after the migration get duty rows; earlier matches are
simply absent from the credit history, so everyone starts at "never took it".
No backfill needed.
