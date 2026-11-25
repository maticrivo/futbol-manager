# Member Role Management — Design

Date: 2026-11-25
Status: proposed

## Intent

Let an administrator promote an active member to admin, and demote an admin back to
member, from the admin members page. The account configured in `ADMIN_EMAIL` is a
superuser: nobody, including themselves, can remove their admin role.

## Goals

- Promote an active member to admin.
- Demote a non-superuser admin to member.
- Never let the team end up without an admin.
- Record every role change in the audit log.
- Explain the restriction in the UI for the superuser and for yourself.

## Non-goals

- Changing how admins are created at sign-up, through `ADMIN_EMAIL` promotion on
  sign-in, or by the seed script.
- Changing member status rules (approve/disable/enable).
- Preventing an admin from disabling the superuser's account; out of scope, and
  `ADMIN_EMAIL` promotion restores the account on the superuser's next sign-in.
- A dedicated admins screen.

## Approaches considered

1. **Role buttons in the member action row (chosen).** “Make admin” / “Remove
   admin” next to Disable/Enable. Guards live in one domain function. Smallest
   surface, consistent with status changes.
2. **Role dropdown inside “Edit details”.** Fewer new pieces, but mixes permissions
   with profile editing, buries the superuser rule in a disclosure, and turns the
   audit trail into a generic profile update.
3. **A dedicated Admins page.** Clearer hierarchy but an extra screen and nav entry
   for two buttons, splitting member management across two places.

## Behavior

### Promotion

- Offered only for members whose role is `member` and status is `active`.
- Server rejects promotion of pending or disabled members with `MEMBER_NOT_ACTIVE`.
- Any active admin can promote; non-admins are rejected with `FORBIDDEN`.

### Demotion

- Offered for any admin except:
  - the signed-in admin themselves (self-demotion is blocked, matching the
    existing “you can’t disable yourself” rule), and
  - the account whose email matches `ADMIN_EMAIL` (superuser, immune to demotion
    by anyone).
- Server rejects both cases with `FORBIDDEN`; the UI hides the button and shows a
  short explanatory note instead.
- Demotion is allowed regardless of the target's status (e.g. a disabled admin can
  be demoted). Disabled admins cannot sign in, so no session revocation is needed.

### Lockout safety

With self-demotion blocked and the superuser immune, at least one admin always
remains, so no separate “last admin” guard is needed. Row locks in ascending user-id
order serialize concurrent cross-demotions; the second transaction re-checks the
actor after locking and fails if they were already demoted.

## Implementation

1. **Domain — `src/domain/members.ts`**
   - Add `setMemberRole(db, actorId, memberId, role)` returning
     `Result<Member, 'FORBIDDEN' | 'NOT_FOUND' | 'MEMBER_NOT_ACTIVE'>`.
   - Lock actor and target rows in ascending id order, like `setMemberStatus`.
   - Check actor is admin, target exists, promotion target is active, target is not
     the superuser when demoting, and actor is not demoting themselves.
   - Update `users.role`; write audit `member.role` with detail `{ role }`; return
     the updated member.
   - Reuse `isConfiguredAdminEmail` from `src/domain/oauth.ts` for superuser
     detection. (`members.ts` currently imports nothing from `oauth.ts`; oauth.ts
     imports `isValidEmail` from members.ts, so the import direction is safe.)

2. **Action — `src/app/actions/admin.ts`**
   - Add `setMemberRoleAction` parsing `memberId` and `role` (`admin` | `member`),
     calling `requireAdmin()` and the domain function.
   - Revalidate `/admin/members`, `/admin`, and `/`.

3. **UI — `src/app/admin/members/page.tsx` and `src/components/MemberActions.tsx`**
   - Pass `role` and `isSuperuser` (`isConfiguredAdminEmail(member.email)`) to
     `MemberActions`.
   - Active non-admin: “Make admin”.
   - Admin: “Remove admin” unless self or superuser; show “You can’t remove your
     own admin role” / “Superuser — admin can’t be removed” instead.
   - Show a distinct “Superuser” badge on the member card in place of “Admin”.

4. **Translations — `messages/en.json`, `messages/he.json`, `messages/es.json`**
   - `admin.members.makeAdmin`, `removeAdmin`, `roleSuperuser`, `selfRoleNote`,
     `superuserNote`.
   - `errors.MEMBER_NOT_ACTIVE`.

5. **Tests — `tests/domain/adminActions.test.ts`**
   - Promote an active member; confirm role and audit detail.
   - Reject promotion of pending and disabled members.
   - Demote an admin.
   - Reject demoting self.
   - With `ADMIN_EMAIL` stubbed, reject demoting that account and allow promoting
     another member as usual.
   - Non-admin actor is rejected (via the action's `requireAdmin` mock rejection
     pattern already used).

## Verification

- `npm test` and `npm run build`.
- Manually: promote an active member, see the badge change; try to demote yourself
  and the `ADMIN_EMAIL` account and confirm the buttons/notes; demote a second
  admin and confirm they lose admin access on their next request.
