# Voy / No voy: match responses and targeted reminders

GitHub issue: #2 ("voy / no voy").

## Intent

Members can say they are going to the match ("voy") by signing up or
joining the waiting list, but they cannot say they are **not** going. Every
scheduled push goes to every active member, so people who already answered
keep getting nagged, and admins cannot tell who still owes an answer.

This change lets a member answer **No voy** for a match, lets them go back
to undecided, and sends the answer-seeking pushes only to members who have
not answered. Admins can see who has not answered.

## Goals

- While signups are open (phases `open` and `guest`), a member can answer
  **No voy**.
- A member who is going can change to **No voy** or back to **undecided**.
  A member who said No voy can change to Voy or back to undecided.
- Leaving the roster, for any reason, frees the spot exactly as a
  withdrawal does today: the waiting list gets it first.
- The signup-open and lock-reminder pushes go only to members who have not
  answered.
- Every member sees a "Not going" list on the home page. Only admins see
  the "No answer yet" list. Who may see it is one policy function, applied
  inside the query, so it can be opened to everyone later by changing that
  function alone.
- No new way to be charged: answering No voy never creates a charge.

## Non-goals

- Changing the guest-phase push. It still goes to every active member: a
  member who is not playing may know someone who can come as a guest.
- Changing the bill-ready or payment-reminder pushes, or the WhatsApp copy
  messages (they go to the whole group).
- Admin actions to set a response on someone else's behalf. Admins can
  still add a member to the roster, as today; that overrides a No voy.
- Refactoring the existing status allowlists in `matchView`, the admin
  match page, `entries`, `lock` and `queue` to use the new module.
- Answering for a match other than the one on the home page
  (`getUpcomingMatch`). A locked match stays there until 6 hours after
  kickoff, so the next match can be answered from Wednesday morning.

## Considered and deferred

- **No voy before signups open** (phase `before`), so a member who knows
  they are away can answer early and skip the signup-open push. Deferred:
  the mobile-first redesign
  (`2026-11-21-mobile-first-ui-redesign-design.md`, Home, "Before signup
  opens: no action") deliberately shows no action in that phase. Even a
  quiet link changes that rule, so it should be its own decision. The data
  model already allows it: enabling it means accepting `before` in
  `decline` and adding the link.

## Known limitations

- Action buttons do not disable while a submit is in flight (unchanged
  `MatchActionForm`). A double tap on Withdraw therefore shows
  `NOT_WITHDRAWABLE` on the second submit, as on `main`. The new answer
  actions (`decline`, `clearDecline`) treat a repeat as a no-op. Disabling
  buttons while pending would fix this for every action and fits a
  separate change.

## Definitions

A member's **response** for a match is derived from their entry row (at
most one per member and match, enforced by
`entries_match_id_member_id_unique`):

| Entry status | Response |
|---|---|
| `confirmed`, `queued`, `offered` | going (Voy) |
| `declined` (new) | not going (No voy) |
| no row, `withdrawn`, `expired`, `removed` | unanswered |

`withdrawn` already means "left without saying no": withdrawing, leaving
the waiting list and letting an offer lapse all write it today. It becomes
the stored form of "undecided". Only active members have a response.
Pending and disabled members are ignored.

## Approaches

1. **Add `declined` to the `entry_status` enum (chosen).** The entry row is
   already the member's single state for a match. Every existing reader
   (roster, queue, offers, lock, charges, cancellation, capacity checks,
   admin roster) filters on an allowlist of active statuses, so a declined
   row is invisible to all of them, and old code tolerates the new value.
   Signup, join-queue and admin-add already reuse an existing row whatever
   its inactive status, so going from No voy back to Voy needs no new path.
2. **A separate `match_responses` table.** Rejected: two sources of truth
   for one member's state on one match, which must then be kept consistent
   with signup, withdrawal, queue and lock transitions.
3. **A `declined` boolean on `entries`.** Rejected: it can contradict the
   status (`confirmed` and declined at once).

## Design

### Schema and migration

- `entryStatusEnum` gains `'declined'`.
- `npm run db:generate` produces a new forward-only migration containing
  only `ALTER TYPE "public"."entry_status" ADD VALUE 'declined';`
  (`drizzle.config.ts` needs `DATABASE_URL` set even to generate). The
  current snapshot matches `src/db/schema.ts`, so nothing else is emitted.
- Rollout follows the runbook: take a `pg_dump`, then apply with
  `npm run db:migrate` against the direct URL before deploying the code.
  Old code never reads `declined` rows, so migrating first is safe, and so
  is rolling the code back.

### Domain: responses (`src/domain/responses.ts`, new)

- `type MatchResponse = 'going' | 'not_going' | 'unanswered'`.
- `responseOf(status: Entry['status'] | null): MatchResponse`, a pure
  mapping implementing the table above. New code uses it rather than
  repeating status lists.
- `canSeeUnanswered(viewer: { role })`, the visibility policy. Today it
  returns `viewer.role === 'admin'`.
- `listMatchResponses(db, { matchId, viewer, now })` returns
  `{ notGoing, unanswered }`. Each is a list of active members with id,
  name, nickname and image, sorted like `listMembers` (by name, falling back
  to the email local part). `unanswered` is `null` unless
  `canSeeUnanswered(viewer)` holds **and** the match phase is `open` or
  `guest`; after lock, everyone not on the roster is out. Because the check
  lives in the query, a page cannot leak the list by forgetting it.

### Domain: answering

- `decline(db, { memberId, matchId, now })` in `src/domain/entries.ts`:
  allowed in phases `open` and `guest`.
  - From `confirmed` or `offered`: set `declined`, clear `offeredAt` and
    `offerExpiresAt`, then `offerNext` in the same transaction, exactly like
    `withdraw`.
  - From `queued`: set `declined`. Nothing is freed; the member just leaves
    the line.
  - From no row, `withdrawn`, `expired` or `removed`: insert or update to
    `declined`.
  - Already `declined`: no-op success, so a double tap is not an error.
  - Errors: `MATCH_CANCELLED`, `MATCH_LOCKED`, `NOT_OPEN` (phase `before`).
- `clearDecline(db, { memberId, matchId, now })`: `declined` →
  `withdrawn`. Already undecided (no row, `withdrawn`, `expired`,
  `removed`): no-op success. Errors: `NOT_DECLINED` (the member is going;
  they use the going → undecided actions below), `MATCH_CANCELLED`,
  `MATCH_LOCKED`, `NOT_OPEN`.
- Going → undecided reuses `withdraw` (from `confirmed`) and `leaveQueue`
  (from `queued`), unchanged; these are the only actions the UI offers
  while on the roster or the waiting list. From `offered`, undecided is
  letting the offer lapse, which `expireOffers` already turns into
  `withdrawn`; **No voy** on an offer passes it to the next member *and*
  answers No voy. `decline` also accepts `confirmed` and `queued` rows, so
  the domain does not depend on which buttons the UI shows.
- Row reuse resets `createdAt` in `signup` and `adminAddEntry`, as
  `joinQueue` already does. The roster is numbered in `createdAt` order, so
  without this a member who said No voy on Friday and signed up on Monday
  would be listed ahead of people who signed up before them. This also
  changes today's behaviour for withdraw-then-sign-up-again, on purpose:
  the member is listed by when they last joined. Queue order is unaffected,
  because a reused row leaves the queue when it is confirmed.

### Server actions (`src/app/actions/match.ts`)

`declineAction` and `clearDeclineAction`, both through the existing
`run(formData, { match: … })`, so they advance the match first and always
revalidate `/`, like the other match actions.

### Notifications (`src/domain/notifications.ts`)

`processDueNotifications` gains an audience per category, read at send
time:

| Category | Audience |
|---|---|
| `signup_open` | active members whose response is `unanswered` |
| `guest_phase` | all active members (unchanged) |
| `lock_reminder` | active members whose response is `unanswered` |
| `bill_ready` | all active members (unchanged) |

- A skipped member is not written to `notification_logs` (the claim happens
  inside `sendMemberNotification`), so a member who returns to undecided
  within the 30-minute window is reminded on the next tick. A member who
  answers after being reminded is not reminded again.
- At signup open, nobody can have answered except members an admin already
  added, so in practice this only stops telling those members to sign up.
- **Queue-offer dedupe.** The offer push is keyed `queue_offer:${entry.id}`
  and rows are reused, so a member who passes, rejoins and is offered again
  never gets the second push. Answering makes that path common, so the key
  becomes `queue_offer:${entry.id}:${offeredAt}` (epoch milliseconds). One
  side effect: an offer that is live at deploy time is pushed once more.
- The lock reminder now goes only to members who have not answered, so its
  copy in `src/lib/notificationCopy.ts` changes (approved): es "¿Vas o no
  vas?" / "La inscripción al partido del {{date}} cierra pronto. Avisá si
  vas o no."; en "Are you playing?" / "Sign-up for the match on {{date}}
  closes soon. Let us know if you're in."; he "מגיעים למשחק?" / "ההרשמה
  למשחק ב־{{date}} נסגרת בקרוב. עדכנו אם אתם מגיעים." The preference label
  stays "Roster lock reminder".

### Member UI (home page)

The redesign's rules apply: one primary action, status as a chip, and the
fixed mobile bar repeats the primary action. Buttons that give something up
(a spot, a place in line, an offer) keep the danger outline; taking back a
No voy costs nothing and is quiet. `MatchView` gains
`myResponse: MatchResponse`. The rules live in a pure helper,
`src/lib/answers.ts` (`answerActions`, `responseChip`). In phases `open`
and `guest`:

| State | Chip | Actions | Where |
|---|---|---|---|
| unanswered | No answer yet | Sign up (or Join the waiting list when full), No voy | desktop actions and `MobileActionBar`; on desktop, Join stays only in `QueuePanel` |
| confirmed | Going | Withdraw (existing label and behaviour) | desktop actions and `MobileActionBar` |
| queued | On the waiting list | Leave the waiting list (existing) | `QueuePanel` |
| offered | none (the offer card says the spot is reserved) | Claim spot (existing), No voy | the offer card in `QueuePanel` |
| declined | Not going | Sign up (or Join the waiting list when full), Not sure yet | desktop actions and `MobileActionBar`; on desktop, Join stays only in `QueuePanel` |

- Withdrawing and leaving the waiting list are an **undo** of the sign-up,
  back to undecided, exactly as before this change. A member who wants to
  say No voy does so afterwards. Two answer buttons on the roster ("No voy",
  "Not sure yet") were tried and dropped: they did not say that they cancel
  the sign-up.
- No voy on an offer answers a new question ("do you want this spot?"), so
  it stays there, next to Claim.
- The chip is a `Badge` in `MatchCard` next to the phase chip.
- `MatchActionForm` gains two intents: `decline` (label `match.decline`,
  danger outline) and `undecided` (`clearDeclineAction`, label
  `match.notSure`, ghost). `withdraw` and `leave` are unchanged.
- `MobileActionBar` shows the answer actions, primary first. When the match
  is full it drops the spots-left label, which "Join the waiting list"
  already conveys and which no longer fits beside two buttons at phone
  width. In `before` it shows only Withdraw, for a member an admin added
  early, as today. It stays hidden in `locked`, `played` and `cancelled`.
- Locked, played and cancelled matches show no answer actions.

### Response lists

- A `ResponsesPanel` component takes `notGoing`, `unanswered` (a list or
  `null`) and `showEmpty`. It renders what it is given, with counts and
  empty states, and knows nothing about roles.
- Like the waiting-list card, it stays visible with its empty state while
  answers are open (`showEmpty` in `open` and `guest`), and otherwise
  appears only when there is someone to list.
- Home page: at the bottom of the page, from `listMatchResponses` with the
  current member as viewer. Admins therefore also see "No answer yet" here.
- Admin match page (`/admin/matches/[id]`): the same panel, with the admin
  as viewer.

### Copy and errors

New keys in `messages/{en,es,he}.json`:

- `match.decline` (No voy) and `match.notSure` (Not sure yet).
- `match.response.{unanswered,going,queued,notGoing}` for the chip.
- `responses.{notGoing,unanswered,notGoingEmpty,unansweredEmpty}` for the
  panel.
- `errors.NOT_DECLINED`.

The lock reminder copy lives in `src/lib/notificationCopy.ts`, not in
`messages/`. New components use logical spacing (`ms-`/`me-`), which
`tests/unit/rtl.test.ts` enforces.

### Main design spec

Update `2026-11-18-weekly-football-manager-design.md`:

- the signup rules (No voy and undecided);
- the queue section (No voy on an offer passes it; a lapsed offer leaves
  the member undecided);
- the notifications list (the audiences above);
- the `entries.status` list in the data model.

## Edge cases

1. A confirmed member who declines frees the spot; the first queued member
   gets an offer, as with a withdrawal. Leaving the waiting list frees
   nothing.
2. Declining or clearing after lock, before signup opens, or on a cancelled
   match is rejected.
3. An admin can add a declined member to the roster; `adminAddEntry` reuses
   the row and sets it to `confirmed`. After lock that creates a charge, as
   for any admin addition.
4. A declined member who signs up later lands at the end of the roster
   order.
5. A decline and a claim on the same offer both take the match row lock
   first, so they serialize. Either order ends with the member `declined`;
   if the claim ran first, the decline frees the spot again.
6. Lock leaves `declined` rows untouched (it expires only `queued` and
   `offered`). Cancellation leaves them untouched too (it expires `queued`
   and `offered` and removes `confirmed`). Neither charges a declined
   member.
7. A member disabled after answering disappears from both lists and from
   all pushes.

## Verification

Automated (`npm test`; needs Postgres 17 and `TEST_DATABASE_URL` in
`.env.test`). The new migration runs on every test run through
`tests/global-setup.ts`, so no schema test changes.

- `tests/domain/responses.test.ts` (new):
  - `responseOf` maps every value of `entries.status.enumValues` (looping,
    as `prefs.test.ts` does, so a new status without a mapping fails);
  - `listMatchResponses` with active, pending and disabled members, each
    status and a guest row, checking membership and order;
  - `unanswered` is `null` for a member viewer and in `before`, `locked`
    and `cancelled`;
  - `canSeeUnanswered`.
- `tests/domain/entries.test.ts`:
  - `decline` and `clearDecline` from every starting status in every phase,
    with starting rows inserted directly;
  - signing up after a decline, and after a withdrawal, lands at the end of
    `getMatchView().roster`.
- `tests/domain/queue.test.ts`:
  - declining a confirmed member or an offer offers the spot to the head of
    the queue;
  - decline racing a claim, using `waitForLockWait` from
    `tests/lock-wait.ts`.
- `tests/domain/lock.test.ts` and `tests/domain/billing.test.ts`:
  - lock and cancel leave `declined` rows and create no charge;
  - admin add over a decline confirms the row, at the end of the roster.
- `tests/domain/notifications.test.ts`:
  - signup-open and lock-reminder audiences across unanswered, declined,
    confirmed and queued members;
  - guest-phase reaches everyone;
  - returning to undecided inside the window gets the reminder;
  - a second offer on a reused row is pushed.
- `tests/domain/matchActions.test.ts`: both new actions, including a lock
  crossed during the action (fails with `MATCH_LOCKED` but still
  revalidates).
- `tests/domain/homePage.test.tsx` (new), rendering `Home()` with
  `renderToStaticMarkup` as `billPage.test.ts` does:
  - an unanswered member's name is absent for a member viewer and present
    for an admin;
  - "Not going" names appear for both;
  - the rendered action intents match the UI table for each state, with
    `MatchActionForm` stubbed.
- The admin match page gets the same visibility check, rendered with the
  mocks from `adminMatchActions.test.ts`.
- `npm run lint` and `npm run build`.

Manual, on `npm run dev` with Google login and a phone-sized viewport in
Spanish and Hebrew:

- sign in as the admin and as a second member; extra members can be given
  a `session` row as `tests/helpers/session.ts` does, with the session
  cookie set in the browser;
- move between phases with the admin match editor (signup, guest-phase and
  lock times) and **Open signups now**.

## Calls made in this document (partner may veto)

- `withdrawn` doubles as "undecided"; there is no separate status for it.
- No voy on an offer is a pass plus No voy; letting it lapse is undecided.
- The signup-open push goes only to unanswered members.
- Re-joining the roster resets the member's position, including after a
  plain withdrawal.
- The queue-offer push key includes `offeredAt`.
- Withdraw and Leave the waiting list stay as the single, unchanged undo
  on the roster and the waiting list; No voy is offered to members who are
  not on either, and on an offer.
- The "Not going" card shows its empty state while answers are open, like
  the waiting-list card.
- On phones, a full match puts "Join the waiting list" in the fixed bar
  next to No voy, following the redesign's primary-action rule (the shipped
  bar was hidden in that state). The spec's "Claim spot" in the bar during
  an offer was never shipped and is left out of scope here.
- The existing "Sign up" / "Anotarme" label stays rather than becoming
  "Voy": when the match is full the primary action is "Join the waiting
  list" instead, so the button does not always mean "voy". The chip, not
  the button, says "Going" / "Voy".
