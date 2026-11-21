# Venue URL for Matches — Design

Date: 2026-11-21
Status: proposed

## Intent

Allow administrators to attach an optional Google Maps (or general map) URL to a match (`venueUrl`), and display the venue name as a clickable external link (`target="_blank" rel="noopener noreferrer"`) in the match card when set.

## Scope & Changes

1. **Database Schema & Migration**:
   - Add `venue_url` (`varchar(500)`, nullable) column to the `matches` table in Drizzle ORM schema (`src/db/schema.ts`).
   - Generate and apply database migration.

2. **Domain & Actions**:
   - Update match domain types and functions (`src/domain/matches.ts`, update match action) to accept, validate, and persist `venueUrl`.
   - Validate that if `venueUrl` is provided, it is a valid URL string up to 500 characters (or empty string/null).

3. **Admin Edit Form**:
   - Add a `venueUrl` text/URL input field to `EditMatchForm.tsx` and update translations (`messages/en.json`, `messages/he.json`, `messages/es.json`).

4. **UI Display**:
   - Update `MatchCard.tsx` (and admin match header if appropriate) so that if `match.venueUrl` is present, `match.venue` renders as an `<a>` link (`target="_blank" rel="noopener noreferrer"`, styled cleanly with hover underline / primary color). If `venueUrl` is absent, it renders as plain text.

## Verification

- Run Drizzle migration.
- Run `npm test` and `npm run build`.
- Manually test editing a match with a Google Maps URL and verifying the link opens correctly in a new tab.
