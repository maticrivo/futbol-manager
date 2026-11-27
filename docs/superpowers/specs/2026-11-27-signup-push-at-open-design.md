# Signup push at the actual signup-open time

## Intent

The "Sign-ups open" push should fire when the match actually starts accepting
registration. Today the scheduler adds a fixed 9-hour delay to
`signupOpensAt` (`src/domain/notifications.ts:148`). That only looks like 09:00
because the default signup time is Friday 00:00. If an admin edits the signup
time, or uses **Open signups now**, the push waits 9 hours and no longer matches
the event it describes.

## Goals

- Make `signup_open` due when `now >= match.signupOpensAt`.
- Move the default `signupOpensAt` from Friday 00:00 to Friday 09:00, so the
  default signup window and its push start together at a human hour.
- Keep the existing 30-minute due window and per-member dedupe in
  `notification_logs`.
- Update the tests and the system design spec so they describe the new timing.

## Non-goals

- Changing the other notification categories, push transport, or subscription
  handling.
- Adding retries outside the existing 30-minute window.
- Changing the guest phase, lock, or kickoff schedule.

## Approaches

1. **Use `signupOpensAt` exactly, and move the default to Friday 09:00
   (chosen).** The push follows both the date and the time the match opens,
   including custom times and manual opens. The default no longer produces a
   midnight push.
2. **Use `signupOpensAt` exactly but keep the Friday 00:00 default.** Rejected:
   the default becomes a midnight notification.
3. **Use 09:00 on the signup-open date, or defer overnight opens until 09:00.**
   Rejected: still hardcodes a morning hour, which is the behavior being
   removed.

The user chose approach 1.

## Design

- In `weekSchedule` (`src/lib/time.ts`), set `signupOpensAt` to Friday 09:00
  instead of Friday 00:00 (four days before the match, at 09:00 Jerusalem time).
- In `processDueNotifications`, change the `signup_open` window start from
  `match.signupOpensAt.getTime() + 9 * 60 * MINUTE` to
  `match.signupOpensAt.getTime()`.
- The existing window check (`start` through `start + 30 minutes`) stays the
  same, as does the event key and the notification log claim.
- Manual **Open signups now** sets `signupOpensAt` to the current instant, so
  the next scheduler tick within 10 minutes sends the push.
- Update `tests/domain/notifications.test.ts`:
  - The `signup_open` boundary case uses Friday 09:00 Asia/Jerusalem and
    09:30.
  - The "only its window is due" case uses the later match's 09:00 window.
- Update `tests/unit/time.test.ts`, `tests/domain/matchView.test.ts`, and
  `tests/domain/tick.test.ts` for the new default signup time.
- Update the weekly cycle and the "calls made" note in
  `docs/superpowers/specs/2026-11-18-weekly-football-manager-design.md` to say
  signup opens at Friday 09:00 and the push follows `signupOpensAt`.

## Verification

- `npm test`
- Confirm the updated `signup_open` tests fail against the old 9-hour offset and
  pass with the new one.
- Confirm the time tests fail against the old midnight default and pass with
  09:00.
