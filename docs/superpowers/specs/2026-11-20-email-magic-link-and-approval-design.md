# Design Doc: Email Magic Links & Member Approval Flow

## Intent & Why
Replace the current invite-token generation system with a self-service sign-in/sign-up page using email magic links sent via **Resend**. New users can enter their email on the login page; if they are not in the system, they are created with a `pending` status. They receive a magic link immediately via email. Upon logging in, if their account is `pending`, they are blocked from participating until an admin approves them via `/admin/members`.

## Goals
1. **Self-Service Login/Signup**: A public `/login` page where any user can type their email and receive a magic sign-in link via Resend.
2. **Member Status (`pending`, `active`, `disabled`)**:
   - New sign-ups start as `pending`.
   - `pending` users can authenticate via magic link, but see a pending notice screen instead of the match app.
   - Admins can manage members (approve pending members, change status to `active` or `disabled`, or manually add members by email).
3. **Free-Tier Email Delivery**: Use Resend API / SMTP for sending emails reliably and for free (within their generous free tier).
4. **No Approval Emails**: No emails are sent upon admin approval; approval simply unlocks app access on the user's next visit/login.

## Non-Goals
- SMS or WhatsApp magic links (deferred due to cost/no free tier).
- Complex RBAC beyond `member` and `admin` roles, combined with member status (`pending`, `active`, `disabled`).

## Constraints
- Next.js 16.4.6 App Router, TypeScript, Drizzle ORM + MySQL.
- Resend API key configured via environment variable (`RESEND_API_KEY`).
- Timezone: Asia/Jerusalem.

## Proposed Changes

### 1. Database Schema
- Modify the `status` enum on `members` table to include `'pending'`:
  - `statusEnum`: `['pending', 'active', 'disabled']`
  - Existing members or newly seeded admin/members default to `'active'`, but new self-service sign-ups start as `'pending'`.

### 2. Domain & Actions
- **`src/domain/members.ts`**:
  - Update `createMember` or add `requestMemberAccess(db, email)`: checks if member exists; if not, creates with `status: 'pending'`, `role: 'member'`, generates a login token, and sends magic link via Resend. If already exists, generates token and sends magic link (if active or pending).
  - Add admin status management (`setMemberStatus(db, actorId, memberId, 'active' | 'disabled' | 'pending')`).
- **`src/lib/email.ts`**:
  - Wrapper around Resend API to send magic link emails.
- **Login Flow (`/login` & `/api/auth/...`)**:
  - Replace the current hardcoded invite token route `/login/[token]` with a clean magic link handler or retain `/login/[token]` for the magic token hash validation.
  - When authenticated, if `member.status === 'pending'`, render a dedicated pending notice page instead of routing to `/`.

### 3. Admin Dashboard (`/admin/members`)**:
- Show member status (`pending`, `active`, `disabled`).
- Provide quick actions for admins to **Approve** (switch status from `pending` to `active`), **Disable**, or **Enable**.
- Allow manual addition of members by email (sets them as `active` or `pending` as chosen by admin).

### 4. Testing & Verification
- Unit and integration tests for magic link request, pending state blocking, and admin approval flow.
