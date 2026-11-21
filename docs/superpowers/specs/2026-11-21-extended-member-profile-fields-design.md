# Design Doc: Extended Member Profile Fields

## Intent & Why
Allow members to set and update their profile details (email, phone, name, image, nickname) during registration or from their profile/settings, while giving admins full permission to edit these fields for any member.

## Goals
1. **Database Schema**: Add columns to the `members` table:
   - `email` (string, unique or optional, currently `requestMemberAccess` uses email as primary identifier).
   - `phone` (string, optional).
   - `image` (string/URL, optional).
   - `nickname` (string, optional).
   - (`name` already exists).
2. **Registration / Profile Completion**:
   - When a user requests access with their email, they can also provide their name, nickname, and phone.
   - Members can edit their own profile fields.
3. **Admin Edit Capabilities**:
   - Admins can edit any member's email, phone, name, image, and nickname from `/admin/members`.

## Non-Goals
- Complex image file uploads requiring object storage (we can support image URL input or avatar URLs for simplicity, keeping hosting free/simple).

## Proposed Changes
- Update `members` table schema and run migration.
- Update `createMember`, `requestMemberAccess`, and member update actions/domain helpers.
- Update admin member management UI and user profile/settings view.
