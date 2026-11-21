# Mobile-first Calm Utility redesign — design

Date: 2026-11-21
Status: proposed, pending approval

## Intent

The app works, but the interface is still close to the framework default: plain white/dark backgrounds, thin gray borders, unstyled links, and little visual hierarchy. Most people will use it on a phone, usually for one question: *am I in this week's match, who else is in, and what do I owe?*

This redesign gives the whole app — player screens and admin screens — one calm, mobile-first visual language: warm off-white surfaces, white rounded cards, one green action color, clear status chips, and big readable numbers. It is a reskin plus layout and navigation work. No domain behaviour changes.

## What was decided together

- Direction **B — Calm Utility** was chosen from three visual directions.
- Scope is **the whole app**: match, bill, profile, sign-in, and all admin screens.
- The approach is **mobile-first**, because most use happens on a phone.
- The visual direction was validated on five mobile screens: Home, Bill, Profile, Admin, Sign in.

## Goals

- Make the player flow obvious at a glance on a phone: match status, spots left, countdown, signup, roster, waitlist.
- Give the app one coherent identity across player and admin screens.
- Improve mobile ergonomics: bottom tab bar, thumb-sized targets, sticky primary action, no horizontal scrolling.
- Make money and time easy to read: tabular numbers, clear due/credit/paid states.
- Keep Hebrew RTL, dark mode, and all three locales first-class.
- Keep every existing action and flow intact.

## Non-goals

- No new product features: no online payments, no new notification types, no new admin powers.
- No change to domain rules, database schema, actions, or API routes.
- No custom illustration or photography.
- No manual theme toggle; dark mode continues to follow the system.
- No image uploads or avatar rendering beyond the existing image URL field.

## Anti-goals

- A decorative skin that makes the app slower or busier.
- A desktop-only dashboard squeezed onto a phone.
- Icon-only navigation that hides meaning.
- Rebuilding the app shell in a way that breaks deep links, auth redirects, or the PWA.

## Constraints

- Next.js 16 App Router, React 19, Tailwind CSS v4, TypeScript.
- Existing server components and server actions stay as they are unless a client interaction requires otherwise.
- Existing tests must keep passing; no new runtime dependencies are needed.
- Hebrew, English, Spanish; RTL for Hebrew; `Asia/Jerusalem` formatting.
- Push notifications and the service worker keep working unchanged.
- The repo already loads Geist Sans/Mono; the body currently falls back to Arial by mistake.

## Approaches considered

1. **Matchday Club** — deep pitch green hero, lime accents, bold matchday energy. Strong team identity, but heavier to keep consistent and less calm for bills and admin.
2. **Calm Utility (chosen)** — warm off-white, white cards, soft shadows, one green action color, generous spacing. Best for one-handed use and fast scanning; applies cleanly to admin screens.
3. **Match Programme** — cream paper, ticket stubs, serif headlines, monospace numbers. Most memorable, but needs the most custom styling and is less conventional for admin data.

Calm Utility won because the app is a weekly utility, not a marketing site. Its restraint scales from the match screen to dense admin lists, and it is the easiest direction to keep accessible in three languages and two color schemes.

## Visual language

### Principles

- **One primary action per screen.** Everything else is secondary or a quiet link.
- **Cards, not borders everywhere.** Content sits on white surfaces over a warm background.
- **Status is a chip, never a bare sentence.** Open, locked, played, cancelled, paid, due, pending all get a labelled chip with a tone.
- **Numbers are first-class.** Spots left, countdown, money, and balances are large and use tabular figures.
- **Quiet admin.** Admin uses the same components with denser spacing, not a different visual system.

### Design tokens

Light mode:

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#f6f5f2` | page background |
| `--surface` | `#ffffff` | cards, bars |
| `--surface-muted` | `#eef0ec` | inset fields, tracks, quiet rows |
| `--line` | `#e4e5e0` | hairlines |
| `--ink` | `#171b19` | primary text |
| `--muted` | `#6b736d` | secondary text |
| `--primary` | `#147a4b` | actions, active nav, progress |
| `--primary-hover` | `#0f6640` | hover/pressed |
| `--primary-soft` | `#e7f3ec` | success chips, selected states |
| `--on-primary` | `#ffffff` | text on primary |
| `--danger` | `#b42318` | destructive actions |
| `--danger-soft` | `#feeceb` | error banners, cancelled chips |
| `--warning` | `#8a5a10` | pending, frozen |
| `--warning-soft` | `#fbf0dc` | pending chips, notices |
| `--focus` | `#147a4b` | focus ring |

Dark mode:

| Token | Value |
| --- | --- |
| `--background` | `#101412` |
| `--surface` | `#181d1a` |
| `--surface-muted` | `#212723` |
| `--line` | `#2c332e` |
| `--ink` | `#f2f4f1` |
| `--muted` | `#9aa39c` |
| `--primary` | `#3fbf83` |
| `--primary-hover` | `#56d096` |
| `--primary-soft` | `#163326` |
| `--on-primary` | `#07130c` |
| `--danger` | `#ff8a80` |
| `--danger-soft` | `#3a1a18` |
| `--warning` | `#f2c46b` |
| `--warning-soft` | `#3a2e17` |
| `--focus` | `#3fbf83` |

Shape and depth:

| Token | Value |
| --- | --- |
| radius-sm | 10px |
| radius-md | 14px |
| radius-lg | 18px |
| radius-xl | 22px |
| radius-pill | 999px |
| shadow-card | `0 1px 2px rgb(20 30 24 / 0.04), 0 8px 24px rgb(20 30 24 / 0.06)` |
| shadow-card (dark) | `0 1px 2px rgb(0 0 0 / 0.30)` |

Spacing: 4px scale. Page gutter 16px on phones, 24px from `md`; section gap 12–16px; card padding 16px on phones, 20px from `md`.

### Typography

- Family: Geist Sans for Latin, Noto Sans Hebrew as fallback for Hebrew glyphs, then `system-ui`. Geist Mono only for the audit detail and countdown digits where tabular alignment matters.
- Display (match time, due amount): 28–34px, weight 800, tracking −0.03em.
- Page title: 22–24px, weight 800, tracking −0.02em.
- Section title: 16–18px, weight 700.
- Body: 15px / 22px.
- Small: 13px / 18px, muted.
- Label: 11–12px, uppercase, tracking 0.08em, muted.
- All numeric data uses `font-variant-numeric: tabular-nums`.
- Wrap user names and venues in `bdi`; numeric runs in `dir="ltr"`.

### Components

Shared primitives live in `src/components/ui/`:

- **Card** — surface, radius-lg, shadow-card, padding. Optional title row with an action slot.
- **PageHeader** — eyebrow, title, optional subtitle, optional trailing slot (avatar or action).
- **Button** — variants: primary, secondary, quiet, danger; sizes: md (44px), sm (36px); full-width option. Implemented as a class helper plus a link variant; `SubmitButton` adopts the same styles and shows a small spinner while pending.
- **IconButton** — 44×44, for compact row actions.
- **Badge** — tones: success, warning, danger, neutral, info; always includes text.
- **Avatar** — initials from the member name, deterministic soft background from a small palette; 24/32/44px sizes.
- **Field** — label, input/select/textarea, hint, error; one consistent focus ring. Inputs are 44px tall on phones.
- **InlineMessage** — success, error, info; replaces the scattered red/green text.
- **EmptyState** — icon, title, one-line explanation, optional action.
- **Stat** — label + large number, used on admin dashboard and money.
- **ProgressBar** — capacity fill, primary color, track in `surface-muted`.
- **SectionNav** — horizontally scrollable pill tabs, used for admin sub-pages.

Icons: a small inline SVG set in `src/components/ui/icons.tsx` (pitch/ball, receipt, person, sliders, chevron, clock, check, warning, copy, plus, minus). Stroke 2, `currentColor`, no icon dependency.

### Motion

- Transitions of 150ms for color, border, and transform; 200ms for expanding panels.
- Respect `prefers-reduced-motion: reduce` by removing transforms and non-essential transitions.
- No page-level entrance animations.

## App shell and navigation

### Phones (`< md`)

- Fixed bottom tab bar, 56px plus `env(safe-area-inset-bottom)`, surface background, hairline top border, labels always visible.
- Tabs: **Match**, **Bill**, **Profile**. A fourth **Admin** tab appears only for admins.
- Active tab: primary icon and label, plus a 2px primary indicator at the top edge of the tab.
- Main content reserves 80px bottom padding so nothing hides behind the bar.
- The top header shrinks to a slim bar with the app name and (when signed in) a small avatar linking to Profile. The language switcher moves to Profile; the header keeps a compact switcher on desktop only.
- The bottom bar is hidden on `/login`, `/login/pending`, `/login/expired`, and `/login/[token]`.

### Tablets and desktop (`>= md`)

- A top bar with app name, primary links (Match, Bill, Admin for admins, Profile), locale switcher, member name, and Sign out.
- Content stays in a centred column: `max-w-3xl` for match/admin, `max-w-xl` for profile/login.
- No bottom bar. Sticky mobile actions return to normal inline placement.

### Admin sub-navigation

- Dashboard, Members, Money, Settings, Audit as a `SectionNav` pill row directly under the admin page title.
- On phones the row scrolls horizontally with no scrollbar; the active pill is primary-soft with primary text.
- On desktop it wraps.

### Auth pages

- No navigation chrome except the locale switcher on sign-in.
- Sign-in, pending, and expired are centred cards with a green logo mark (rounded square with a ball/pitch glyph) as a placeholder brand mark.

## Screen-by-screen

### Home (`/`)

1. **Page header** — eyebrow with the kickoff date (e.g. “Tuesday, 24 Nov”), title “Tuesday match”, avatar linking to Profile.
2. **Match hero card** — phase chip; kickoff time as the display number; date; venue; cost; spots left and capacity as a large number plus progress bar; inline countdown pill for the next transition.
3. **Primary action** — depends on state:
   - Signup open and spots available: primary “Sign up”.
   - Signup open, full, no entry: primary “Join waiting list”.
   - Signed up and withdrawable: quiet “Withdraw” inside the player's own roster row; no hero CTA.
   - Offer reserved: highlighted offer card with expiry and primary “Claim spot”.
   - Before signup opens: no action; the countdown says when signups open.
   - Locked/played/cancelled: no action; a short explanatory line.
   - On phones, the primary action is duplicated in a fixed action bar above the tab bar; on desktop it stays inline in the hero card.
4. **Roster card** — title “Who's going” with “12/16” count; avatar row for the first 6 plus “+N”; list rows with avatar, name, guest host, “You” badge. Guests removable by host/admin keep their quiet action.
5. **Waiting list card** — title, position line, numbered list, join/leave button. The offer state gets a primary-soft card with a primary border and an expiry clock.
6. **Guests card** — only during the guest phase; name field plus add button.
7. **Empty state** — no upcoming match: centred card with clock icon, “No match scheduled yet”, and an admin-only “Create next match” action.

### Bill (`/bill`)

1. **Page header** — eyebrow with billing month, title “Bill”.
2. **Summary card** — “Amount due” with the due amount as display type; a success chip when settled; outstanding balance or credit line below. No fake payment button: a short muted note explains that an admin records PayBox or cash payments.
3. **Charges card** — rows of date and amount, with a “Waived” badge where applicable; empty state.
4. **Payments card** — date, method chip, amount, note; empty state.
5. **Notification settings card** — switch-style checkboxes for the six categories, one Save button, inline success/error.
6. **Push card** — status-aware: enable button, subscribed state with disable, denied/unsupported/iOS-install guidance as an inline message with numbered steps.

### Profile (`/profile`)

1. **Page header** — title “Profile”, subtitle.
2. **Identity card** — large initials avatar, name, email.
3. **Details card** — name, nickname, email, phone, image URL fields; save button; inline success/error.
4. **Language card** — segmented control with עברית / English / Español; submitting changes the locale immediately.
5. **Sign out** — quiet danger text button at the bottom.

### Sign in (`/login`)

- Centred logo mark, “Tuesday Football”, one-line subtitle.
- Card with email field and primary “Send sign-in link”; optional details expander with name, nickname, phone, image URL.
- Success state replaces the form with a success message.
- Locale segmented control under the card.

### Pending (`/login/pending`)

- Centred warning-soft card with clock icon, “Account pending approval”, explanation, “Signed in as …”, and a secondary Sign out button.

### Expired (`/login/expired`)

- Centred neutral card with link icon, “Link expired or revoked”, “Ask an admin for a new link”, and a link back to sign in.

### Admin dashboard (`/admin`)

1. **Page header** — eyebrow “Admin”, title “Dashboard”.
2. **Admin sub-nav**.
3. **Upcoming match card** — phase chip, date/time, venue, confirmed/capacity; primary “Manage match” link; secondary “Create next match” action. Empty state with the create action when no match exists.
4. **Stat grid** — total members, active members, outstanding balance, this month's pot; 2 columns on phones, 4 from `md`.
5. **Manage list** — Members, Money, Settings, Audit as rows with chevrons.

### Admin members (`/admin/members`)

- Add-member card: email or name, role, status, language; inline invite link with copy.
- Member list as stacked cards (no wide table): name and nickname, status chip, email/phone, role, locale, created date.
- Actions per card: Approve/Disable/Enable, Regenerate link, and an “Edit details” expander containing the existing edit form.
- Desktop keeps the same cards in a denser two-column grid; no horizontal scroll at any width.

### Admin money (`/admin/money`)

- Month picker card with a styled month input and “Show”.
- Summary card with six stats (charges, member payments, guest payments, field rent, pot, outstanding) in a 2-column grid on phones, 3 on desktop; inline rent form with save feedback.
- Balance list: one card per active member with name, balance or credit, and actions — “Mark paid”, “Record payment” expander (amount, method, note, target month), “Send reminder”. Actions stack on phones.
- Copy-message card with the preformatted bill text and a copy button.

### Admin settings (`/admin/settings`)

- One card with capacity, cost, venue, kickoff time, queue window; single column on phones, two columns from `md`; save button and inline feedback.

### Admin audit (`/admin/audit`)

- Activity list, newest first: time, actor (or “System”), action as a neutral chip, entity and id, and a collapsible monospace detail. Cards stack on phones; on desktop the same rows align in a grid.
- Empty state.

### Admin match detail (`/admin/matches/[id]`)

- Header card: phase chip, date/time, spots left, confirmed count, back link.
- Copy signup message card.
- Edit match card grouped into schedule, money/capacity, and notes; locked/finished notices in warning-soft; existing “Open signups now” action.
- Roster card: player cards with charge amount, waive/restore, remove with reason, and the add-member form.
- Attendance card: each player with a three-way Present / No-show / Not set control.
- Guest payments card: guest rows with payment history and record/refund forms.
- Cancel match card: danger-soft surface, existing confirmation checkbox, danger button.

### Not found

- The catch-all keeps `notFound()`; add a styled `not-found` card with a link home.

## UX behaviour and states

- **Feedback** — every form keeps its `aria-live` region. Success and error messages become `InlineMessage` banners; the pending state shows a spinner and a “working” label.
- **Focus** — `:focus-visible` gets a 2px focus ring with 2px offset on every interactive element.
- **Touch** — interactive controls are at least 44×44px on phones. Rows that contain actions keep actions on their own line when space is tight.
- **No horizontal scroll** — verified at 320px width. Tables become stacked cards; long emails and JSON details break or truncate with a copy affordance.
- **Countdown** — keeps the existing client logic and refresh rules. Only the presentation changes: a pill in the hero with tabular digits and a fixed height to avoid layout shift; `—` placeholder before hydration.
- **Offer expiry** — the offer card shows the local expiry time and remains the most prominent element while active.
- **Capacity** — progress bar reflects confirmed/capacity; a full match shows a “Full” badge.
- **Destructive actions** — existing confirmations are preserved; no new modal flows in this version.
- **Reduced motion** — honoured as described above.

## Accessibility, RTL, i18n

- Bottom tabs use real links with visible labels and `aria-current="page"` on the active tab.
- Admin sub-nav uses links with `aria-current`.
- Status chips always include text, not color alone.
- Decorative icons are `aria-hidden`; icon-only controls get an accessible label.
- Headings keep a logical order (one `h1` per page, `h2` per section).
- All spacing and alignment uses logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`), so RTL mirrors without extra CSS.
- Chevrons and arrows mirror in RTL; countdown digits and money stay LTR inside `bdi`.
- The language switcher uses the member's chosen locale and submits the existing action.
- New UI copy is added to `messages/en.json`, `messages/es.json`, and `messages/he.json`; no hard-coded strings.

## PWA chrome

- Update `viewport.themeColor` to a media pair: light `#f6f5f2`, dark `#101412`.
- Update the manifest `background_color` and `theme_color` to match the new palette.
- Keep the existing icons and service worker unchanged.

## Implementation approach

- **Tokens in CSS.** Replace the `:root` / `@theme inline` block in `globals.css` with the light and dark token sets above, mapped to Tailwind color, radius, and shadow utilities. Keep `prefers-color-scheme` for dark mode.
- **Fonts.** Keep Geist Sans/Mono and add Noto Sans Hebrew via `next/font/google` for Hebrew glyphs. The body uses the `font-sans` stack; Arial is removed.
- **Primitives first.** Build `src/components/ui/` primitives, then migrate pages one at a time. No page keeps ad-hoc border/gray classes once migrated.
- **Shell.** Split `Nav` into a desktop top bar and a client `BottomNav` that reads `usePathname` for the active tab. Pass links and role from the server component. Add a client `AdminNav` with active pills.
- **Home.** Merge `MatchCard` and `Countdown` visually into the hero card; keep `Countdown`'s logic untouched. Add a mobile-only fixed action bar that renders the same `MatchActionForm` intent as the inline action. Restyle `RosterList`, `QueuePanel`, and `GuestForm` with the primitives.
- **Admin.** Replace wide tables with responsive card lists in Members, Money, and Audit. Keep all existing forms and actions; restyle fields and buttons.
- **Server/client boundary.** New primitives are server components by default. Only the nav active state and existing interactive forms are client components.
- **No new runtime dependencies.** Class composition uses a tiny local `cn` helper.
- **Migration order** (each step leaves the app working):
  1. Tokens, fonts, primitives, shell.
  2. Home and auth pages.
  3. Bill and Profile.
  4. Admin dashboard, members, money.
  5. Admin match detail, settings, audit.
  6. Not-found and PWA chrome.
- **Commit style.** One commit per migration step, after lint, tests, and a build pass.

## Testing and verification

- `npm run lint`, `npm test`, and `npm run build` pass after each step.
- Existing tests are untouched; no domain logic changes.
- Manual matrix:
  - Widths 320, 375, 768, 1280.
  - Locales en, he (RTL), es; check no truncation and no horizontal scroll.
  - Light and dark system appearance.
  - Keyboard-only pass on sign-in, match actions, bill prefs, admin forms.
  - Reduced-motion mode.
- Flow checks: signup, withdraw, join/leave queue, claim offer, add/remove guest, save profile, change language, save notification prefs, enable push, admin add/approve/disable member, record payment, waive/restore charge, edit match, attendance, guest payment/refund, cancel match.
- Verify the fixed action bar never covers the last card and sits above the tab bar plus safe area on iPhone.

## What is left to the builder

- Exact icon choices and the small logo mark.
- Deterministic avatar palette and initials rules (including single-word and Hebrew names).
- Precise responsive breakpoints inside cards where the spec says “stack on phones”.
- Whether the audit detail is collapsed by default (recommended: yes).
- The exact wording of the few new labels; all must be added to the three message files.
- Any micro-spacing adjustments needed to keep Hebrew text from wrapping awkwardly.

## Follow-ups (not in this design)

- Manual light/dark toggle.
- Avatar image rendering with fallbacks.
- Loading skeletons for route transitions.
- Page-specific metadata titles.
- Any new confirmation dialogs for destructive actions.
