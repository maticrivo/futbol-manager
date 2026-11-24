# Design Doc: Social Login with Auth.js

## Intent & Why

Replace the current email magic-link sign-in with Google and Facebook sign-in using Auth.js (NextAuth v5) and the Drizzle adapter. There is no production member data, so the database can be reset and Auth.js's own tables can become the canonical user store, extended with the fields this app needs.

The approval flow stays the same: a new member signs in, lands with `pending` status, completes their profile, and an admin approves them in `/admin/members` before they can use the match, queue, and billing features.

Auth.js creates the user from the provider's profile, so the profile starts with the provider's name, email, and avatar; phone, nickname, and locale remain app-managed fields.

## Goals

1. **Google and Facebook sign-in/sign-up** on `/login`, replacing the email form.
2. **Auth.js canonical schema**: `user`, `account`, and `session` tables from the Auth.js Drizzle adapter, extended with app columns.
3. **Unchanged approval model**: new users are `pending`; pending users can sign in and edit their profile but cannot use the app; admins approve, disable, or re-enable members.
4. **Profile prefill**: name, email, and image from the social profile on first sign-in.
5. **Keep existing member features**: role, status, phone, nickname, locale, profile photo, notification preferences, push subscriptions, audit history, and billing references all keep working against the new user IDs.
6. **Email is provider-owned and read-only in the app** once a user exists. It is the account-linking key, so changing it locally would split accounts on a later provider sign-in.
7. **Session lifetime stays effectively long**: 365 days.
8. **Remove the magic-link stack**: email form, Resend delivery, login tokens, invite links, and the `/login/[token]` route.
9. **Admin bootstrap**: `ADMIN_EMAIL` gets an active admin account; without it, the operator promotes their own first login manually in the database.
10. **Admin account linking**: an admin can attach a pending duplicate's provider account to an existing member, covering the case where a member's social accounts use different emails.
11. **Self-service account linking**: a signed-in member can connect their other provider from `/profile`, even when the provider's email differs from the member's email.
9. **Fresh database baseline**: regenerate the initial Drizzle migration and reset local/Neon/test databases.

## Non-Goals

- Keeping magic links as a fallback or keeping the Resend dependency.
- Passwords, phone/WhatsApp sign-in, or email verification flows.
- Merging two accounts that already have match, queue, or billing history. Admin linking is limited to `pending` duplicates, which have no such history.
- Unlinking a provider from a member. Connected accounts can only be added or replaced by an admin.
- Using provider APIs after login (no token refresh, calendar access, etc.).
- Preserving existing rows, IDs, or migration history.
- A general multi-tenant or multi-organization auth model.

## Anti-Goals

- Do not keep a parallel `members` table and map it to Auth.js's `user` table. Auth.js tables are the only user store.
- Do not let a `pending` user reach match, queue, or billing pages.
- Do not let a `disabled` user sign in or keep a working session.
- Do not silently overwrite name, email, or image edited by the user on later sign-ins.
- Do not let a user self-approve.

## Constraints

- Next.js 16.4.6 App Router, React 19, TypeScript, Drizzle ORM 0.45, PostgreSQL 17 / Neon.
- Auth.js v5 is still beta. `next-auth@5.0.0-beta.30` declares support for Next 16; `@auth/drizzle-adapter@1.11.0` aligns with its `@auth/core@0.41.0` dependency. Pin both rather than floating.
- OAuth requires Google Cloud OAuth credentials and a Facebook app, plus registered callback URLs:
  - local: `http://localhost:3000/api/auth/callback/google`, `.../facebook`
  - production: the deployment origin with the same paths.
- Facebook Login requires HTTPS redirect URIs and app review/test-user configuration before people outside the app's testers can use it. Local Facebook testing may need an HTTPS tunnel.
- Sign-in is unavailable if the provider credentials are missing; this cannot be mocked away in production.
- The app keeps using its existing custom `getCurrentMember`/`requireMember` guards, adapted to read the Auth.js session.

## Approaches Considered

1. **Custom OAuth route handlers with the existing sessions table** — rejected after the decision to adopt Auth.js. It would have kept the current `members`/`sessions` tables and owned approximately 150 lines of provider protocol code.
2. **Auth.js with its own tables and database sessions (chosen)** — standard OAuth handling, proven Drizzle adapter, no custom protocol. Cost: a fresh schema with Auth.js table/column names and text user IDs, plus rewriting auth tests.
3. **A small OAuth library (e.g. Arctic) with the existing sessions table** — middle ground, but still a custom bridge and an extra dependency without the benefits of the full Auth.js ecosystem.

Auth.js was chosen because the database can be reset, the approval/profile features are already ours, and Auth.js supplies the OAuth flow, account linking, and session storage we would otherwise maintain.

## Database Design

### Auth.js tables

Use the Drizzle adapter's default PostgreSQL schema names and columns:

- `user`: `id` (text UUID), `name`, `email` (unique), `emailVerified`, `image`.
- `account`: `userId`, `type`, `provider`, `providerAccountId`, provider token columns, composite PK on `(provider, providerAccountId)`.
- `session`: `sessionToken` PK, `userId`, `expires`.

Omit `verificationToken` and `authenticator`; nothing uses email verification or WebAuthn.

### Extended `user` columns

Add app fields to `user`:

- `role`: `member_role` enum, default `member`, not null.
- `status`: `member_status` enum, default `pending`, not null.
- `phone`: varchar(40).
- `nickname`: varchar(60).
- `locale`: varchar(5), default `en`, not null.
- `created_at`, `updated_at`: timestamptz(3), not null.

The `user` table is passed to `DrizzleAdapter` as `usersTable`; this is the same Auth.js table, not a mapping layer. The adapter inserts only its own columns, so the app columns take their database defaults on first sign-in.

`user.name` stays nullable like Auth.js's default, but the application normalizes it for display:

```ts
type Member = Omit<typeof users.$inferSelect, 'name'> & { name: string }
```

`toMember(row)` fills a missing name with the email local part, then `"Player"`. This keeps all existing `member.name` usages as plain strings. The sign-in callback also fills a missing provider name before creation so the common case stores a real name.

### Foreign keys and IDs

App tables currently reference `members.id` (integer). They now reference `user.id` (text):

- `entries.member_id`, `host_member_id`
- `charges.member_id`, `waived_by`
- `payments.member_id`, `recorded_by`
- `guest_payments.recorded_by`
- `expenses.updated_by`
- `push_subscriptions.member_id`
- `notification_prefs.member_id`, `notification_logs.member_id`
- `audit_logs.actor_id`

The database columns can keep their existing `member_id` names; only their type and referenced table change. Application code keeps the domain term "member" and accepts `string` IDs. The old `members`, `login_tokens`, and `sessions` tables disappear.

### Migration

Because there is no data, delete the existing Drizzle baseline and generate a fresh `0000` migration from the new schema. Reset local, test, and deployment databases before applying it. Document the reset command in the runbook. This is a one-time destructive step, not an incremental migration.

## Auth.js Configuration

`src/auth.ts` exports `handlers`, `auth`, `signIn`, and `signOut`:

- `adapter: DrizzleAdapter(getDb(), { usersTable, accountsTable, sessionsTable })`
- `session: { strategy: 'database', maxAge: 365 * 24 * 60 * 60 }`
- `pages: { signIn: '/login', error: '/login' }`. Auth.js appends `?error=<code>`; `/login` owns the localized error mapping. `/login/expired` stays a static session-expired page reached by the guards.
- Providers: `Google`, `Facebook`, both with `allowDangerousEmailAccountLinking: true`.
- `callbacks.signIn`:
  - Reject a profile without an email; redirect to `/login?error=email-missing`.
  - Lowercase and trim the email; fill a missing name from the email local part.
  - Resolve an existing user by id when Auth.js already found the linked account, otherwise by normalized email. This keeps the disabled check correct even if a row's email was changed in the database.
  - Reject `disabled`; allow `pending` and `active`.
  - If an existing user's email matches `ADMIN_EMAIL`, promote it to `role = 'admin'`, `status = 'active'`. This covers the operator who signed in before setting `ADMIN_EMAIL`, and a previously admin-created row.
  - Allow `pending` and `active` after any promotion.
- `events.createUser`:
  - If the email matches `ADMIN_EMAIL`, set `role = 'admin'` and `status = 'active'`.
  - Otherwise leave defaults (`member`, `pending`).
  - Write `member.request_access` audit history.
- `events.signIn`: write `auth.login` audit history with the provider.
- `events.linkAccount`: write `member.link_account` audit history for provider account links (first sign-in and self-service), including the provider and user.

`allowDangerousEmailAccountLinking` is enabled so:
- an admin-created user can claim their row by signing in with a matching provider email, and
- the same person can use either Google or Facebook without hitting `OAuthAccountNotLinked`.

This is acceptable for a private, admin-approved friend group. Both providers are expected to return verified emails; Facebook users without an email are rejected by the callback.

Auth.js is configured through the standard environment variables:

```env
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_FACEBOOK_ID=
AUTH_FACEBOOK_SECRET=
ADMIN_EMAIL=
```

`AUTH_URL` / host trust settings are added only if the deployment environment needs them.

## Authentication Flows

### First social sign-in

1. User taps Google or Facebook on `/login`.
2. Auth.js runs the OAuth flow and calls `signIn`.
3. Email is required and normalized. Name is filled if missing.
4. No user exists, so Auth.js creates one from the profile with defaults `role=member`, `status=pending`; `name`, `email`, and `image` come from the provider.
5. `events.createUser` promotes `ADMIN_EMAIL` to an active admin, or leaves the account pending.
6. Auth.js creates a database session and sets its session cookie.
7. App navigation calls `getCurrentMember`; a pending member is redirected to `/profile` by `requireMember`, and sees the existing pending notice.
8. Admin approves in `/admin/members`; the next request sees `active` and grants access.

### Returning sign-in

Auth.js finds the account by provider and session; it does not overwrite the stored name, email, or image. Profile edits persist. A disabled user is rejected by the `signIn` callback and any existing session resolves to no member. If the row's email matches `ADMIN_EMAIL` but the role/status is stale, the callback repairs it.

Email is shown read-only on the profile and admin edit forms. Changing it is a deliberate database operation, not an app action, because it is the key used to link a second provider.

### Second provider sign-in, same email

If the same email signs in through the other provider, `allowDangerousEmailAccountLinking` links the new `account` row to the existing user and keeps the existing profile and status.

### Second provider sign-in, different email

When signing in without an existing session, Auth.js only links by verified email or an already-known provider account. A different email is a different identity, so it creates a second `pending` user. We do not auto-link by name or avatar; that would be unsafe.

An admin resolves this from `/admin/members`:

1. The pending duplicate card offers **Link to existing member** with a searchable/selectable list of existing active members.
2. The action locks the pending user and target user, moves every `account` row from the pending user to the target, deletes the pending user's `session`, notification preference, and push subscription rows, then deletes the pending user.
3. The move is audited as `member.link_account` with the provider names, pending user ID, and target user ID.
4. The pending duplicate disappears from the approval queue. The next Google/Facebook sign-in with the moved provider account resolves to the target member and keeps the target's email, role, status, and profile.

Only `pending` users can be linked by an admin. Merging two `active` users with history is out of scope; the admin must choose one and disable the other. This keeps the operation safe because pending users cannot yet have entries, charges, or payments.

The target's email remains its current value. The duplicate's email is discarded with the pending row; the provider account ID is what keeps future sign-ins working.

This requires `audit_logs.actor_id` to be `on delete set null` and the user-owned setup rows (`notification_prefs`, `push_subscriptions`) to cascade on user deletion. Other member references stay restrictive so a user with history cannot be deleted accidentally.

### Self-service account linking

`/profile` gets a **Connected accounts** section. It lists Google and Facebook with either a "Connected" state or a **Connect** button.

- Connect runs Auth.js `signIn(provider, { redirectTo: '/profile' })` while the member is signed in. Auth.js's existing-session branch attaches the new `account` row to the current user without requiring an email match, which is exactly the different-email case.
- The member's stored name, email, and image are not changed by the second provider.
- Pending members can connect accounts too; approval is still required before app access.
- The action writes `member.link_account` through `events.linkAccount` and is auditable like the admin path.
- If that provider account is already attached to another user (usually a pending duplicate), Auth.js raises `OAuthAccountNotLinked`. The member is sent back to the auth error surface with a message telling them an admin must link it. The admin **Link to existing member** control is the resolution.
- If the provider is already connected to the current member, the profile shows "Connected" instead of a Connect button.

### Pending and disabled members

- Pending: can sign in, edit profile, set push/notification preferences; cannot access match, queue, or billing pages.
- Disabled: sign-in rejected; `getCurrentMember` returns null for any existing session; admin disabling also deletes that user's `session` rows.
- Re-enabled: can sign in again.

### Sign out

`logoutAction` calls Auth.js `signOut` with a redirect to `/login`, which also deletes the database session. `/login/expired` remains the guard destination for missing or stale sessions. The old hashed-token session helpers are removed.

### Admin-created users

Keep the admin "add member by email" form. It creates a `user` row with the supplied name, email, role, and status, but no invite link. That person claims the row on their first social sign-in via email account linking.

Add a **Link to existing member** control on pending member cards, backed by a server action that performs the transactional move described above. It is admin-only, confirms the target, and is disabled when there are no active members.

Remove the "regenerate invite" action and `InviteLink` UI. Magic-link invites no longer exist.

### Seed

Seed only what still makes sense without fake login-capable members:

- Create the admin user from `ADMIN_EMAIL`, `SEED_ADMIN_NAME`, and the existing locale default **only when no user with that email exists**. Never overwrite an existing user's name, locale, role, or status.
- Create default settings and the upcoming match, using the existing admin's ID when the row already exists.
- Do not create the 18 name-only placeholder players; they cannot sign in and would clutter the approval queue.

`ADMIN_EMAIL` is required for a useful seed. If it is absent, the seed reports that the operator must either set it or promote their first login in the database. Setting `ADMIN_EMAIL` after an earlier sign-in still works because `callbacks.signIn` promotes the existing row on the next sign-in.

## Application Changes

### Session helpers

`src/lib/auth.ts` becomes a thin wrapper over Auth.js:

- `getCurrentMember`: `auth()`, then load the `user` row by ID; return null when missing or disabled; return a normalized `Member`.
- `requireMember`, `requireSessionMember`, `requireAdmin`: unchanged behavior.
- Remove `SESSION_COOKIE`, `SESSION_COOKIE_OPTIONS`, `clearSessionCookie`, and `deleteSessionByToken`.

### Domain

- Replace the `members` table object with `users` and `Member` normalization.
- Remove `loginWithInvite`, `requestMemberAccess`, `requestMagicLink`, `regenerateInvite`, and login-token logic.
- Keep `createMember` as an admin/seed helper, but it only inserts the user row (and audit); it no longer generates tokens.
- `setMemberStatus` deletes `session` rows when disabling instead of revoking app sessions.
- Add `linkPendingMemberToMember(db, actorId, pendingId, targetId)` with transaction locks, `FORBIDDEN`/`NOT_FOUND`/`NOT_PENDING` errors, account moves, setup-row cleanup, pending-user deletion, and audit.
- Add `listLinkedProviders(db, userId)` for the profile's Connected accounts section; the actual attach is Auth.js's `signIn` while authenticated, not a custom account insert.
- Update every `memberId` type from `number` to `string` and every membership/admin ID parser accordingly.
- Keep name, phone, nickname, and image validation. Reject any profile patch that tries to change an existing email; admin-created rows set it once at creation.

### Routes and UI

- Add `src/app/api/auth/[...nextauth]/route.ts` exporting `handlers`.
- Delete `src/app/login/[token]/route.ts` and the magic-link form/action.
- `/login` renders two branded buttons: "Continue with Google" and "Continue with Facebook". It reads Auth.js's `?error=` code and shows a localized message: specific ones for `email-missing`, `AccessDenied`, and `OAuthAccountNotLinked`, and a generic "Sign-in failed, please try again" fallback.
- When `/login?error=OAuthAccountNotLinked` is reached by an already signed-in member, the page does not redirect them to `/`; it shows "That account is already connected to another member — ask an admin to link it" with a **Back to profile** button. For signed-out visitors, the same page shows the sign-in error and the regular buttons.
- Keep `/login/pending` and `/login/expired`; `/login/expired` stays the guard destination for a missing or stale session and no longer claims a magic link failed.
- Update all three locales (`en`, `es`, `he`) with social button, connected-account, and auth error strings. Verify RTL and mobile layouts.
- Profile page shows social-provided name/email/image, with email read-only, plus all app-managed fields and the Connected accounts section.

### Removals

- `src/lib/email.ts` (Resend) and its tests.
- `loginTokens` schema and related tests.
- Invite URL generation in admin actions, `MemberActions`, and `InviteLink`.
- `requestMagicLinkAction` and `LoginForm`.
- Resend environment variables from examples/docs.

## Risks

- **Auth.js v5 beta**: pinned versions may need a small adjustment if `@auth/drizzle-adapter` and `next-auth` disagree on `@auth/core`. The design pins 1.11.0 with beta.30; verify installation at implementation time.
- **Facebook setup friction**: HTTPS callback URIs, app review, and missing-email accounts. Local testing may require a tunnel or Google-only verification.
- **Account linking by email** is a deliberate tradeoff. Mitigate by keeping admin approval and requiring an email from the provider.
- **Self-service link conflicts**: if the provider is already attached to a pending duplicate, Auth.js refuses the link. The UI must explain that an admin needs to resolve it rather than leaving the member on a generic error page.
- **ID type change** touches every member reference; TypeScript should surface misses, but billing/queue entry flows need careful tests.
- **Destructive reset**: running the new baseline against a non-empty database will fail or destroy data. The reset step must be explicit.

## Testing

- Unit-test the `signIn` callback: missing email rejected, disabled rejected, pending/active allowed, name/email normalization, existing-`ADMIN_EMAIL` promotion.
- Unit-test `events.createUser`: default pending member, `ADMIN_EMAIL` promotion, audit row.
- Unit-test `getCurrentMember`: active, pending, disabled, missing session.
- Integration-test admin approval and disable/re-enable, including session deletion on disable.
- Integration-test admin account linking: pending-only enforcement, account move, setup-row cleanup, pending-user deletion, audit row, and a subsequent sign-in resolving to the target.
- Test `listLinkedProviders` and the profile's connected/unconnected states.
- Test that a self-service link attempt for an account already attached elsewhere surfaces `OAuthAccountNotLinked` and the admin-resolution message.
- Test `events.linkAccount` writes the link audit row for first sign-in and self-service.
- Test that profile email changes are rejected and the forms render email read-only.
- Test the `/login` error-code mapping, the `email-missing` redirect, and the signed-in `OAuthAccountNotLinked` state with **Back to profile**.
- Rewrite existing auth/profile tests to create `user` rows and Auth.js `session` rows directly; remove magic-link/email tests.
- Test profile prefill/editing against the extended `user` row.
- Run `npm test`, `npm run lint`, and `npm run build`.

## Manual Verification

1. Reset the database and apply the new baseline.
2. Set Google/Facebook credentials and `ADMIN_EMAIL`.
3. Sign in with Google as `ADMIN_EMAIL`; confirm active admin access.
4. Sign in with a second account; confirm `pending`, prefilled profile, and blocked app pages.
5. Approve the second account as admin; confirm access.
6. Disable it; confirm existing session is invalidated and sign-in is rejected.
7. Sign in with the other provider using the same email; confirm it links to the same user.
8. From the existing member's profile, connect the second provider whose email differs; confirm it appears as Connected and the next sign-in with that provider lands on the same member.
9. Repeat the different-email case from a signed-out state, creating a pending duplicate. Link it to the existing member as admin, confirm the duplicate disappears, and confirm the next sign-in with that provider lands on the original member.

## What Is Left to the Builder

- Exact Drizzle schema code, migration filenames, and reset script shape.
- Exact component styling for the two provider buttons and icons.
- Handling any Auth.js type augmentation needed for the session user.
- Choosing whether to write the `member.request_access` audit in `createUser` or a shared helper.
- Updating the runbook and README for OAuth credentials and the destructive reset.
