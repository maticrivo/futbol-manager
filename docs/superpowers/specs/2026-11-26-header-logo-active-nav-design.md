# Header Logo and Active Navigation — Design

Date: 2026-11-26
Status: approved

## Intent

Make the app header feel branded and make it obvious which section the user is in.
Add the existing app icon beside the app name, give mobile its own top header, and
mark the active item in both the desktop and mobile navigation.

## Goals

- Show the app logo beside the app name in every top header.
- Add a static top header on mobile with the logo and app name.
- Mark the active section in the desktop nav with a soft green pill.
- Mark the active section in the mobile bottom bar with a soft green pill behind
  the emoji and a primary-coloured label.
- Expose the active item to assistive technology with `aria-current="page"`.

## Non-goals

- Sticky or auto-hiding headers.
- New icon artwork or replacing the bottom-bar emoji.
- Locale switcher changes.
- Redesigning page content or the admin tabs.

## Approach

One shared `NavLink` client component reads `usePathname()` and renders either the
desktop pill or the mobile tab, so both surfaces use the same active logic. The
existing route helpers move from `Nav.tsx` to `src/lib/nav.ts` so the client
component does not import the server nav module.

## Design

- `src/components/ui/Logo.tsx`: renders `/app-icon.svg` through `next/image` at
  28px, rounded and ringed, `alt=""` because the app name is adjacent text.
- `src/components/Brand.tsx`: logo plus app name, used by desktop, mobile, and the
  signed-out header.
- `src/components/MobileHeader.tsx`: `md:hidden` static bar, same surface and
  bottom border as desktop.
- `DesktopNav`: brand replaces the bare name; plain links become `NavLink`.
- `BottomNav`: items become `NavLink variant="mobile"`.
- Active desktop style: `bg-primary-soft text-primary` pill, inactive
  `text-muted hover:text-ink`.
- Active mobile style: emoji inside a `bg-primary-soft` pill, label `text-primary`;
  inactive `text-muted`.
- `src/lib/nav.ts`: `isAdminTabActive` and `isPrimaryNavActive`, moved verbatim;
  update the existing nav test import.

## Verification

- Unit tests for active and inactive `NavLink` in both variants, including the
  `/admin/*` case.
- `npm run lint`, the unit suite, and `npm run build`.
- Manual visual check once the app can run: header on desktop and mobile, active
  state while on home/bill/admin/profile.
