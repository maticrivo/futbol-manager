# Design Doc: Tuesday Football Adjustments (Venue, Kickoff, Name & Early Signup)

## Intent & Why
Refine the app's defaults and admin capabilities to match the actual group operations:
1. **Default Venue**: Matches are always at **Onim (אונים)** with a Google Maps link (`https://maps.app.goo.gl/WPPALMNQFfW3MX7L6`). Remove "Venue to be confirmed" and let admins override the venue name and Google Maps link per match or globally.
2. **Default Kickoff Time**: Matches are on **Tuesday at 20:00**, with admin override.
3. **App Name**: Change branding from "Weekly Football" / "Weekly Football Manager" to **"Tuesday Football"**.
4. **Early Signup Override**: Give admins a way to start signups before the automatic Friday 09:00 start (e.g. force-opening signups immediately or setting a custom `signupOpensAt` per match).

## Goals
- **Branding**: Update application title, metadata, UI header, navigation, manifest, and translation dictionaries to "Tuesday Football" (כדורגל שלישי).
- **Default Venue & Time**: When creating new matches (via `createMatchForDate` or `createNextMatch`), default venue to "Onim (אונים)" (with maps URL `https://maps.app.goo.gl/WPPALMNQFfW3MX7L6`) and kickoff time to `20:00`.
- **Match Edit / Override**: Update match editing (`updateMatch` / `EditMatchForm`) and settings (`Settings` / `SettingsForm`) so admins can edit the venue name, venue maps link, kickoff time, and open signups immediately.
- **Early Signup Action**: Add an admin action/button on the match detail page to **Open signups now** (setting `signupOpensAt` to the current time, bypassing the Friday 09:00 schedule if desired).

## Non-Goals
- Changing the 14-player capacity or ₪35 cost rules.

## Proposed Changes

### 1. Branding ("Tuesday Football")
- Update layouts, headers, manifest (`src/app/manifest.ts`, `src/app/layout.tsx`), and i18n dictionaries (`messages/{en,he,es}.json`) to brand the app as **Tuesday Football**.

### 2. Default Venue & Kickoff Time (`Onim`, 20:00)
- Update `DEFAULT_SETTINGS` in `src/domain/settings.ts`:
  - `venue`: `"Onim (אונים)"`
  - `venueUrl`: `"https://maps.app.goo.gl/WPPALMNQFfW3MX7L6"` (add `venueUrl` to settings schema and match schema if needed, or store venue as text/link or separate fields). Let's check how `venue` is stored in `matches` table (`venue` varchar(120)). We can store venue name and map URL or format venue as a link/metadata. Let's add `venueUrl` to matches and settings tables, or allow venue name + map url.
  - `kickoffTime`: `"20:00"`
- Update `weekSchedule` in `src/lib/time.ts` to compute kickoff at 20:00 on Tuesday.

### 3. Early Signup Control
- Add an admin action `openSignupsNowAction(matchId)` that sets `signupOpensAt = now` immediately, revalidating match view and `/`.
- Add an "Open signups now" button in the admin match detail page (`/admin/matches/[id]`).
