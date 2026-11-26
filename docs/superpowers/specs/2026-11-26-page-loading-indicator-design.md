# Page Loading Indicator — Design

Date: 2026-11-26
Status: approved

## Intent

Pages are server-rendered with auth and database queries, so tapping a nav link
can leave the screen apparently frozen until the next page arrives. Show immediate
feedback on every navigation with a spinning football, so the app always feels
responsive.

## Goals

- Show a loading indicator immediately on any client navigation between pages.
- Keep the desktop header, mobile bottom nav, and install banner mounted and
  interactive while the next page streams in.
- Use a custom SVG football that spins smoothly.
- Respect `prefers-reduced-motion` and announce loading to screen readers.
- Read correctly on both light and dark themes.

## Non-goals

- Per-page skeleton screens.
- A top progress bar or inline link-level hints.
- Changes to data fetching, caching, or prefetching.

## Approaches considered

1. **Route-level `loading.tsx` (chosen).** One fallback at the app root covers
   every route under the shared root layout. The old page is replaced by a
   centered football while the new page streams in. No per-link wiring.
2. **Inline link hint with `useLinkStatus`.** Keeps the old page visible and puts
   a small football next to the tapped nav link. Lighter, but easy to miss on a
   phone and requires wiring each nav component.
3. **Global overlay driven by link clicks.** Most control over placement, but
   fragile duplicate navigation logic; the framework already provides fallbacks.

## Design

- New `src/app/loading.tsx`, a client component (so translations come from the
  already-mounted `NextIntlClientProvider` without extra data access). It renders
  the football centered in a `min-h-[60vh]` content area with padding so it
  clears the fixed mobile bottom nav.
- The wrapper is `role="status"` and includes a visually hidden localized
  "Loading…" using the existing `common.loading` message.
- New `src/components/ui/FootballSpinner.tsx`: an inline SVG soccer ball — white
  circle with dark pentagon patches clipped to the circle — with fixed colors so
  it reads on both themes, sized around 60px.
- `src/app/globals.css` gets a spin keyframe (one rotation per second) and a
  `prefers-reduced-motion` rule that stops the animation.
- No new dependencies.

## Verification

- `npm run lint` and `npm run build`.
- Manually navigate between home, bill, admin, and profile and confirm the
  football appears while the next page loads and disappears when it renders.
- Check reduced motion in the browser dev tools.
