# Groundwork — Revert Stripe 4b + Switch Currency to ZAR — Design Spec

**Context:** The marketplace is moving its payments provider from **Stripe to Stitch** (stitch.money — a South-African pay-in/payout API; ZAR only). Stitch has no Stripe-Connect-style hosted seller onboarding or connected accounts, so the Phase 4b Stripe Connect work is the wrong model and must be removed before building the Stitch flows. Stitch settles in **ZAR**, so the marketplace (currently USD) must switch to Rand. This sub-project does that groundwork; the Stitch flows (seller payout setup, Pay By Bank checkout, escrow + disbursement) are separate later sub-projects.

This is the **first** sub-project of the Stitch payments pivot. See the roadmap's "Stitch payments pivot" section.

## Decisions (locked)
1. **Revert Stripe 4b** — remove the dead Stripe Connect integration entirely (it is code-verified-only, never runtime-tested, and not pushed to origin).
2. **Switch to ZAR** — all money display/labels become Rand ("R"); the integer-`cents` storage is unchanged (R1 = 100 cents, same as USD), so only formatting/labels/currency-default change, not the stored amounts or the math.
3. **Drop all three stripe `Storefront` columns** (`stripeAccountId`, `stripeChargesEnabled`, `stripePayoutsEnabled`) — none are used after the revert; Stitch will add its own columns later.
4. **Re-label demo data, do not re-price** — the same integer amounts now read as ZAR (placeholder data; not worth 18×-ing the seed).

## Out of scope (later Stitch sub-projects)
- Seller payout setup on Stitch (bank-details form + Stitch bank-account verification) — replaces Stripe 4b.
- Pay By Bank checkout / order pay-in.
- Escrow hold → 18% commission → disbursement release (buyer-confirm-receipt, else auto after 3 days) + Stitch/Svix webhooks.

---

## Part A — Revert Stripe 4b

**Delete** (all introduced by Phase 4b):
- `src/lib/stripe.ts`
- `src/lib/stripe-onboarding.ts`, `src/lib/stripe-onboarding.test.ts`
- `src/app/sell/payouts/page.tsx`, `src/app/sell/payouts/actions.ts`, `src/app/sell/payouts/return/page.tsx`, `src/app/sell/payouts/refresh/page.tsx` (the whole `src/app/sell/payouts/` tree)
- `src/components/sell/PayoutsPanel.tsx`
- `src/app/api/stripe/webhook/route.ts` (and the now-empty `src/app/api/stripe/` tree)
- `e2e/payouts.spec.ts`

**Edit** `src/app/sell/page.tsx`:
- Remove the `onboardingState` import, the `prisma.storefront.findUniqueOrThrow({ select: { stripe… } })` query, the `payoutState` computation, and the soft "set up payouts" banner JSX. The dashboard returns to its pre-4b shape (listings only). The `main ul > li` E2E invariant is preserved (the banner was a `<div>`, so removing it changes nothing for that count).

**Dependency:** `npm uninstall stripe` (removes `stripe` from `package.json`/lockfile). **`.env`:** remove `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (local only, not committed).

**Schema/migration:** remove the three stripe columns from `model Storefront` in `prisma/schema.prisma`:
- `stripeAccountId String?`
- `stripeChargesEnabled Boolean @default(false)`
- `stripePayoutsEnabled Boolean @default(false)`

This produces a `DROP COLUMN` migration (combined with Part B's currency change into a single migration — see below). It is a column drop, not a reset — **the migration guardrail still applies: if `prisma migrate dev` proposes a database RESET / reports drift, STOP and escalate; never accept a reset.**

---

## Part B — Switch currency to ZAR

### `src/lib/money.ts` (rewrite)
Replace the dollar-named helpers with ZAR ones. Storage stays integer cents; only naming + the rendered symbol change.

```ts
/** Parse a Rand string to integer cents, or null if invalid. No float math. */
export function parseZar(input: string): number | null {
  const t = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** Format integer cents as a ZAR amount, e.g. 12000 → "R120.00". */
export function formatZar(cents: number): string {
  return `R${(cents / 100).toFixed(2)}`;
}
```
Note `formatZar` now **includes the `R` symbol** (whereas `centsToDollars` returned only the number and call sites prepended `$`). Call sites therefore drop the literal `$`/`R` prefix and render `{formatZar(x)}` directly. `money.test.ts` is updated to match (`parseZar`, `formatZar(12000) === "R120.00"`, invalid-input → null, etc.).

### Call-site sweep (mechanical)
Every non-deleted file that imported `centsToDollars`/`dollarsToCents` is updated:
- `${centsToDollars(x)}` (with a literal `$`) → `{formatZar(x)}` (symbol now inside).
- `dollarsToCents(...)` → `parseZar(...)`.
- Input placeholders/labels and aria-labels: "USD"/"$" → "ZAR"/"R"/"Rand" (e.g. `placeholder="Offer (R)"`, `aria-label="Offer amount in Rand"`, `aria-label="Counter amount in Rand"`).

Affected files (the price/offer-bearing ones; the Stripe files in this list are deleted in Part A): `src/app/sell/page.tsx`, `src/components/sell/OfferActions.tsx`, `src/components/bag/BagControls.tsx`, `src/app/sell/offers/page.tsx`, `src/app/sell/offers/actions.ts`, `src/app/bag/page.tsx`, `src/app/bag/actions.ts`, `src/app/listings/[id]/page.tsx`, `src/components/listings/ListingCard.tsx`, `src/app/sell/listings/[id]/edit/page.tsx`, `src/app/admin/page.tsx`, `src/app/sell/actions.ts`, `src/components/sell/ListingForm.tsx`, `src/lib/listing-query.ts`.

**Completeness gate:** after the sweep, a grep for `centsToDollars|dollarsToCents|"USD"|in USD|\(USD\)` and a price-adjacent literal `$` in `src/` returns nothing (excluding unrelated `$` like template-literal interpolation or CSS).

### `Listing.currency` default
In `prisma/schema.prisma`, change `currency String @default("USD")` → `@default("ZAR")`. The migration also updates existing rows: append `UPDATE "Listing" SET "currency" = 'ZAR' WHERE "currency" = 'USD';` to the generated migration SQL (Prisma does not rewrite existing data on a default change). The `currency` column is not used in app logic today (display is hardcoded ZAR via `formatZar`), so this is for data consistency.

### Single combined migration
Parts A and B both change `prisma/schema.prisma`. Do them as **one** migration (e.g. `--name drop_stripe_and_zar`): drops the 3 stripe columns + changes the `Listing.currency` default; then hand-append the `UPDATE … SET currency='ZAR'` statement to the migration's `migration.sql`. Apply to the live dev DB via `npm run db:migrate` (guardrail: no reset).

---

## Testing / verification
- **Vitest** `src/lib/money.test.ts`: rewritten for `parseZar`/`formatZar` — `formatZar(12000)==="R120.00"`, `formatZar(0)==="R0.00"`, `parseZar("120")===12000`, `parseZar("120.50")===12050`, `parseZar("abc")===null`, `parseZar("1.234")===null`.
- **Grep gate** (completeness): no `centsToDollars`/`dollarsToCents`/`"USD"`/money-`$` left in `src/`.
- **Build** green; the route table no longer lists `/sell/payouts*` or `/api/stripe/webhook`.
- **Full unit suite** green — count drops by 3 (the removed `stripe-onboarding` tests) and the new `money.test.ts` count adjusts; report actual numbers.
- **Full E2E** green — `payouts.spec.ts` removed (−3 tests); the remaining specs (favorites/follows/counter-offer/public/seller/buyer-offer/etc.) still pass. Existing specs that assert on prices must be checked: any E2E asserting a `$` amount needs updating to `R` (search the `e2e/` dir for `$`-amount or "USD" assertions and update).
- **Honesty:** this is fully runtime-verifiable locally (no external creds needed) — distinct from the Stitch flows, which will be runtime-deferred until Stitch test credentials exist.

## Build order (for the plan)
1. Revert Stripe 4b: delete the files + edit `sell/page.tsx` + `npm uninstall stripe` (no migration yet).
2. `money.ts` → `parseZar`/`formatZar` + rewrite `money.test.ts` (TDD).
3. Call-site sweep (`formatZar`/`parseZar` + ZAR labels) across the ~14 files + grep gate; update any `e2e/` price assertions to `R`.
4. Single combined migration: drop 3 stripe columns + `Listing.currency` default→ZAR + `UPDATE` existing rows (guardrailed).
5. Full green gate: lint, unit, build (no stripe/payouts routes), E2E; grep gate clean.
