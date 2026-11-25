# Paybox group link

## Intent and why

Members get a push notification when their monthly bill is ready and when an
admin sends a payment reminder. Both open the app's bill page, which today only
shows what is owed; there is no way to actually pay from there. The group
collects money through a Paybox group, so the bill page should link straight to
that group. The link must be configurable by an admin, because the invite link
can change and differs per deployment.

## Goals

- An admin can set a Paybox group URL on `/admin/settings`.
- The bill page shows a prominent "Pay on Paybox" button whenever the member
  owes money and a URL is configured.
- Tapping a bill-ready or payment-reminder notification lands on the bill page,
  one tap away from Paybox. Notifications themselves stay unchanged.

## Non-goals

- No Paybox API integration, payment verification, or automatic reconciliation.
  Admins keep recording payments by hand, as today.
- No per-member payment links; one shared group link.
- No change to notification copy, preferences, or delivery.
- The button is never shown when the month is settled or the URL is unset.

## Anti-goals

- A "Pay" button that appears with nothing to pay, inviting double payment.
- Accepting non-HTTP schemes (e.g. `javascript:`) in the admin field.

## Constraints

- `settings` is a key/value table; a new key needs no migration.
- URL validation and storage follow the existing `venueUrl` pattern
  (`isHttpUrl`, 500-character limit, empty allowed).
- Three locales: he, en, es.

## Approaches considered

1. **Setting + button on the bill page (chosen).** Add `payboxUrl` to the
   settings domain, form, and action; render a `Button href` in the bill due
   card. Reuses every existing pattern; notifications already point at `/bill`.
2. **Setting + internal `/pay` redirect route.** Adds click tracking and lets
   the link change without touching the client, at the cost of a route and
   indirection for a link that rarely changes. Rejected as unnecessary.
3. **Environment/config file instead of a setting.** Requires a deploy to change
   and diverges from every other admin-tunable value. Rejected.

## Decisions

- New setting key `payboxUrl`, default empty string.
- Admin field labelled "Paybox group link", optional, validated as an HTTP(S)
  URL up to 500 characters; empty clears it.
- Bill page reads settings and renders an external link button with
  `target="_blank"` and `rel="noopener noreferrer"` so the installed app stays
  in the background. Shown only when `bill.dueAgorot > 0` and the URL is set.
- Button label: "Pay on Paybox" (he: "לתשלום בפייבוקס", es: "Pagar en Paybox").
- Tests: `settings.test.ts` covers default, save, clear, and rejection of a
  non-URL value; `adminActions.test.ts` covers the action parsing.

## Left to the builder

- Exact placement within the due card, and whether the button spans full width
  on mobile.
- Whether to note in the UI that an admin records the payment after it arrives
  (helpful, but not required).
