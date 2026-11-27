# Mobile pull-to-refresh and zoom — design

Date: 2026-11-27
Status: approved

## Intent

Two mobile annoyances. First, the app is server-rendered and usually runs as an
installed PWA: when a teammate signs up or an admin records a payment, a phone can keep
showing stale data until the user navigates away and back. Android Chrome has a browser
refresh gesture, but it reloads the whole page and is unavailable in an installed iOS
app. Second, the page zooms when a field gets focus, and accidental pinches and
double-taps change the scale. Add a familiar pull-down-at-the-top refresh that updates
the current screen in place, and lock zoom down as far as the platform allows.

## What was decided together

- Refresh gesture is pull **down** at the top of the page, not a swipe up from the bottom.
- It applies to signed-in mobile screens, not auth pages or desktop.
- Fields become 16px on phones, so iOS no longer auto-zooms on focus.
- Add the viewport lock (`maximum-scale=1`, `user-scalable=no`) and
  `touch-action: manipulation`, accepting that iOS may ignore the viewport lock.

## Goals

- Pull down from the top of any signed-in mobile screen to refetch that route's
  server data.
- Give immediate feedback: the indicator follows the finger, then spins while the
  refresh runs.
- Preserve scroll position and client state by using `router.refresh()`, not a full
  page reload.
- Work in installed PWAs on iOS and Android without triggering the browser's own
  refresh or page bounce.
- Stop iOS focus zoom by making text fields 16px on phones.
- Disable pinch zoom where the OS honours it, and double-tap zoom everywhere.
- Respect `prefers-reduced-motion`, dark mode, RTL, and screen readers.
- Leave desktop and auth pages unchanged.

## Non-goals

- Automatic polling or background revalidation.
- A refresh button in the header or nav.
- Pull-to-refresh on `/login`, `/login/pending`, or `/login/expired`.
- Changes to data fetching, caching, or server actions.
- New runtime dependencies.
- Forcing zoom off on iOS when Safari ignores the viewport lock; that is accepted.

## Approaches considered

### Pull-to-refresh

1. **Custom touch-gesture component (chosen).** A small client component listens for
   touches at the top of the page, renders its own indicator, and calls
   `router.refresh()`. No dependency, full control over resistance, threshold, and
   feedback, and it works identically in Safari standalone and Android Chrome.
2. **Rely on the browser's native refresh.** Android Chrome has one, iOS standalone
   does not, and it performs a full reload that loses scroll and client state. Not
   consistent enough to call a feature.
3. **Add a refresh button.** Reliable and simple, but it is not the gesture the user
   asked for and adds permanent chrome. Keep it as a possible fallback only.
4. **Use a pull-to-refresh library.** Adds a runtime dependency against the project's
   convention, and most libraries do not account for the Next router or the app's
   fixed bottom bar. The component is small enough to own.

### Zoom

1. **16px fields + viewport lock + `touch-action: manipulation` (chosen).** Stops the
   iOS focus zoom at its cause, blocks pinch zoom on Android, and removes double-tap
   zoom everywhere. Simple, declarative, no JavaScript.
2. **16px fields only.** Best for accessibility, but does not satisfy the request to
   disable page zoom.
3. **JavaScript gesture interception.** Fragile, fights scrolling, and cannot reliably
   override browser pinch zoom. Rejected.

## Design

### Pull-to-refresh

#### Component and placement

- New `src/components/PullToRefresh.tsx` client component.
- Mounted from `Nav` inside the active-member branch, next to `MobileHeader`, so it
  appears only on signed-in screens and never on auth pages.
- Visible and active only below `md` (768px). Desktop sees no change.

#### Gesture

- Touch events on the window; activation requires a single touch, `window.scrollY <= 0`,
  a mobile viewport, and no refresh already running.
- Track the downward delta. Apply resistance (roughly half the finger movement, capped
  near 96px) so the indicator feels elastic and cannot be dragged arbitrarily far.
- While pulling at the top, prevent the default on non-passive `touchmove` to suppress
  iOS rubber-banding and Android's native refresh. Downward-only; an upward drag or a
  drag that starts below the top scrolls normally.
- Release at or above the threshold (64px) starts the refresh; below it, the indicator
  eases back.
- `touchcancel`, viewport changes, or `orientationchange` reset the gesture cleanly.

#### Refresh

- Start the refresh inside `useTransition` and call `router.refresh()`, using the
  pending state to keep the spinner up until the updated server payload is applied.
- Keep the spinner visible for a short minimum (~500ms) so fast refreshes still feel
  acknowledged.
- `router.refresh()` re-fetches server components for the current route and merges the
  result without losing scroll position or unaffected client state.

#### Indicator

- A compact pill fixed at the top centre, above page content and below the mobile
  header, with a small circular surface and the existing `refresh` icon.
- At rest it is hidden. While pulling it follows the distance and the icon rotates with
  progress; past the threshold the icon reaches its active state. While refreshing it
  spins continuously.
- With `prefers-reduced-motion`, the indicator appears without continuous spinning and
  transitions are removed.
- `role="status"` with `aria-live="polite"` announces "Refreshing…" while running; the
  visual icon is `aria-hidden`.

#### Native overscroll

- Add `overscroll-behavior-y: contain` for mobile viewports in `globals.css`, so
  Android does not run its own full-page refresh while our gesture is active.
- Keep the existing scroll container and fixed bottom bar untouched.

### Zoom

#### Viewport

- Extend `generateViewport` in `src/app/layout.tsx` with `width: 'device-width'`,
  `initialScale: 1`, `maximumScale: 1`, and `userScalable: false`, keeping the existing
  theme-color logic.
- The resulting meta tag is
  `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no`.
- Android honours it. iOS may ignore it; the 16px field fix still prevents focus zoom.

#### Fields

- Add a mobile-only (`max-width: 767px`) rule in `globals.css` that sets
  `font-size: 16px` on `input`, `select`, and `textarea`.
- The rule is unlayered so it beats Tailwind's `text-sm` utilities; at `md` and above the
  existing 14px sizing returns and the desktop layout is unchanged.
- This covers every current form and any future field, not just the ones that use
  `Field`.

#### Touch behaviour

- Add a mobile-only rule setting `touch-action: manipulation` on `button`, `a`,
  `[role='button']`, `input`, `select`, and `textarea`.
- This removes double-tap zoom and the tap delay without blocking normal scrolling or
  text selection.

### i18n

- Add `common.refreshing` to `messages/en.json`, `es.json`, and `he.json`; no visible
  hard-coded text.

## Files

- `src/components/PullToRefresh.tsx` — new client component and indicator.
- `src/lib/pull-to-refresh.ts` — new pure helpers for activation, resistance, and
  threshold decisions, so the tricky parts are unit-testable.
- `src/components/Nav.tsx` — mount the component for active members.
- `src/app/layout.tsx` — viewport zoom lock.
- `src/app/globals.css` — mobile field size, touch behaviour, overscroll, and
  reduced-motion-safe animation.
- `messages/{en,es,he}.json` — the refreshing announcement.
- `tests/unit/pull-to-refresh.test.ts` — unit coverage for the gesture helpers.

## Testing and verification

- `npm run lint`, `npm test`, and `npm run build` pass.
- Manual checks on an iPhone in Safari standalone and Android Chrome standalone:
  pull down at the top refreshes; pulling mid-page scrolls; pulling up scrolls; a short
  pull snaps back; no full page reload; scroll position is preserved.
- Focusing every field type (text, email, tel, url, number, date, month, select,
  textarea) on iOS does not zoom the page; fields render at 16px on phones.
- Android honours the viewport lock; pinch and double-tap do not zoom.
- Desktop at 768px and above is unaffected, and fields keep their 14px size.
- RTL (Hebrew) keeps the indicator centred and announcements correct.
- Reduced-motion mode shows a static indicator.
- Existing bottom-tab, admin sub-nav, and form interactions are untouched.

## What is left to the builder

- Exact resistance curve, threshold, and minimum spinner duration within the ranges above.
- Indicator size, spacing below the mobile header, and easing.
- Whether the icon uses a simple rotation or a small football; if a second football is
  used, avoid duplicating the clip-path id in `FootballSpinner`.
- Exact input selector list if some control type should be excluded from the 16px rule.
