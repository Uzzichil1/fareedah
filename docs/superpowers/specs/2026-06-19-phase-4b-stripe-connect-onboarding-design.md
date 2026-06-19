# Phase 4b — Stripe Connect (Express) Seller Onboarding — Design

**Date:** 2026-06-19
**Status:** Approved (brainstorm) — ready for implementation plan
**Phase:** 4b (first payments sub-phase). Decomposition: **4b onboarding** → 4c checkout/escrow/commission → 4d Shippo shipping → 4e messaging.

## Goal

Let a seller connect a Stripe **Express** account so they can receive payouts, and track whether their account can be charged and can receive payouts. This is the groundwork that 4c (checkout) builds on. It covers everything **up to but not including** taking a payment.

## Decisions (locked in brainstorm)

- **Scope:** 4b only (Stripe Connect Express onboarding). 4c–4e get their own spec→plan→build cycles.
- **Account type:** **Express** — Stripe-hosted KYC/onboarding + Stripe-managed payouts/compliance and a lightweight seller dashboard, while we keep a branded platform experience and (in 4c) take an application fee via destination charges. Best fit for many small individual sellers.
- **Test mode:** Stripe **test** keys. No real money in this phase.
- **Status sync:** **webhook (`account.updated`) + on-return fetch** — the webhook keeps stored status fresh; the on-return `accounts.retrieve` gives the seller immediate feedback. (Rejected: fetch-only = stale/racey; webhook-only = no instant return feedback.)

## Current state this builds on

- `Storefront` already has `stripeAccountId String?` (unused until now). `User`/`Storefront`/`Listing`/`Bundle`/`Order` models exist; `Order.commissionCents`, `Bundle.stripePaymentIntentId` are provisioned for 4c (NOT used in 4b).
- `.env` already has `PLATFORM_COMMISSION_PERCENT="18"` and `PAYOUT_AUTO_RELEASE_DAYS="3"` (those belong to 4c). **No Stripe keys exist yet.**
- The app uses server actions (`"use server"`), `requireSeller()`/`verifySession()` from `src/lib/dal.ts`, `revalidatePath`, and the shared UI primitives. Migrations are applied to the live Supabase dev DB during the build (confirm `DIRECT_URL`).
- A 17-spec Playwright E2E net guards the existing surface (runs against the live dev DB with self-cleaning `e2e+*@test.tk` fixtures; keep port 3000 free of `next dev`).

## Data model

Migration (applied to live Supabase). `Storefront` gains two booleans (`stripeAccountId` already exists):

```prisma
model Storefront {
  // ...existing fields, including: stripeAccountId String?
  stripeChargesEnabled Boolean @default(false) // Stripe account.charges_enabled — buyers can be charged for this seller's items
  stripePayoutsEnabled Boolean @default(false) // Stripe account.payouts_enabled — seller can receive money
}
```

**Derived onboarding state** (pure function, no Stripe call):
- `not_started` — `stripeAccountId == null`
- `incomplete` — has `stripeAccountId` but not (`stripeChargesEnabled && stripePayoutsEnabled`)
- `enabled` — `stripeChargesEnabled && stripePayoutsEnabled`

## Components

### `src/lib/stripe.ts`
Server-only Stripe client singleton, constructed from `STRIPE_SECRET_KEY`, pinned to a Stripe API version. Reused by actions and the webhook. Never imported into client components.

### `src/lib/stripe-onboarding.ts` (pure — unit-tested)
`onboardingState({ hasAccount, chargesEnabled, payoutsEnabled }) => "not_started" | "incomplete" | "enabled"`. Pure logic, no I/O, so it is unit-testable in isolation (mirrors the `src/lib/bundle.ts` pattern). Drives the page CTA and the dashboard banner.

### Actions — `src/app/sell/payouts/actions.ts`
- `startStripeOnboarding()`:
  1. `requireSeller()` → `{ userId, storefrontId }`.
  2. Load the storefront. If no `stripeAccountId`, create a Stripe Express account (`stripe.accounts.create({ type: "express", ... })`) and persist `stripeAccountId` (atomic update scoped to the storefront).
  3. Create an `account_onboarding` Account Link (`stripe.accountLinks.create`) with `return_url = <APP_URL>/sell/payouts/return` and `refresh_url = <APP_URL>/sell/payouts/refresh`.
  4. Return `{ url }` for the client to redirect to (or `redirect(url)` server-side). Account Links are single-use and expire — always mint a fresh one.
- `refreshOnboardingStatus()`:
  1. `requireSeller()`, load storefront; if no `stripeAccountId`, no-op.
  2. `stripe.accounts.retrieve(stripeAccountId)`; update `stripeChargesEnabled`/`stripePayoutsEnabled` from `charges_enabled`/`payouts_enabled`.
  3. `revalidatePath("/sell/payouts")` and `revalidatePath("/sell")`.

Ownership is always derived from the authenticated session (no client-supplied account id), and writes are scoped to the caller's own storefront (no IDOR).

### Page — `src/app/sell/payouts/page.tsx` (server component, `requireSeller`-gated)
- Reads the **stored** flags (no Stripe call on load → keeps the page testable and fast).
- Renders by derived state:
  - `not_started` → "Set up payouts" CTA → `startStripeOnboarding`.
  - `incomplete` → "Continue setup" CTA (+ a "Refresh status" affordance calling `refreshOnboardingStatus`).
  - `enabled` → "Payouts enabled ✓" confirmation.
- Branded with the design system; linked from the seller dashboard.

### Return / refresh routes
- `/sell/payouts/return` (page): runs `refreshOnboardingStatus()` (or a server-component fetch+persist), then shows the resulting state. This is where the seller lands after Stripe-hosted onboarding.
- `/sell/payouts/refresh` (page/route): the seller arrives here if the Account Link expired mid-flow; mint a fresh Account Link via `startStripeOnboarding` and redirect back to Stripe.

### Webhook — `POST /api/stripe/webhook` (route handler)
- Read the raw body; verify the `Stripe-Signature` header with `STRIPE_WEBHOOK_SECRET` (`stripe.webhooks.constructEvent`). Reject missing/invalid signatures (400).
- Handle `account.updated`: look up the `Storefront` by `stripeAccountId` (the event's `account`); update `stripeChargesEnabled`/`stripePayoutsEnabled` from the event payload. Idempotent (updating to the same values is a no-op). Ignore unrelated event types (200, no-op).
- Returns 200 quickly on handled/ignored events.

### Seller dashboard banner — `src/app/sell/page.tsx`
- When the storefront's derived state is not `enabled`, show a **soft** banner: "Set up payouts to get paid" → links to `/sell/payouts`. **No hard gate** on listing/editing in 4b. (Hard gating of checkout on `stripePayoutsEnabled` is a 4c concern.)
- Must not introduce a nested `<ul>` under `/sell`'s `<main>` (the E2E seller spec counts `main ul > li`). A banner `<div>` above the list is safe.

## Environment & dependencies

- Add the `stripe` npm package (server SDK).
- New env vars (test mode): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. For the Account Link return/refresh base URL, **reuse the existing `AUTH_URL`** (`http://localhost:3000`) — it already names the app origin, so no new env var is needed.
- Publishable key / Stripe.js are **not** needed in 4b (onboarding is server-side create + redirect to a Stripe-hosted page). They arrive in 4c (client-side checkout).
- Document local webhook testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook` (prints the `whsec_…` for `STRIPE_WEBHOOK_SECRET`).

## Testing strategy

- **Unit:** `onboardingState` (all three states, edge cases).
- **E2E (no Stripe round-trip needed — keep the 17 specs green and add):**
  - A signed-in seller with no `stripeAccountId` sees the "Set up payouts" CTA on `/sell/payouts` (the page reads stored flags, so no Stripe call), and the soft banner appears on `/sell`.
  - `POST /api/stripe/webhook` with a missing/invalid signature is rejected (400) — verifies the signature gate without needing real Stripe events.
- **Runtime-deferred (documented honestly, like Google SSO / Cloudinary):** the real Stripe flow — Express account creation, the hosted onboarding redirect, the `account.updated` webhook updating flags, and the `enabled` confirmation — cannot be exercised until test keys + the Stripe CLI are configured. The code is written and code-verified; the live round-trip is a human smoke once keys exist.

## Acceptance criteria

- Migration adds `stripeChargesEnabled`/`stripePayoutsEnabled` (applied to Supabase); Prisma client regenerated.
- A seller can click "Set up payouts" and be redirected to a Stripe-hosted onboarding flow; on return, their status reflects Stripe (`incomplete`/`enabled`).
- The `account.updated` webhook updates the storefront's flags; the endpoint rejects unsigned requests.
- The seller dashboard shows the soft "set up payouts" banner until enabled; nothing hard-blocks listing.
- `npm run lint`, `npm test` (incl. the new unit test), `npm run build`, and `npm run test:e2e` (existing 17 + the new 4b specs) all green.
- Where the live Stripe round-trip is runtime-deferred, that is stated explicitly (not claimed as runtime-verified).

## Explicitly out of scope (later phases)

Checkout, PaymentIntents/destination charges, the 18% commission capture, escrow + payout auto-release (3d), buy-now vs offer payment, Shippo shipping labels (4d), and messaging (4e).
