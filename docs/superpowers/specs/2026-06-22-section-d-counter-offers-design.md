# Section D — Counter-offers — Design Spec

**Roadmap:** Section D in `docs/superpowers/yaga-parity-roadmap.md`.
**Goal:** Yaga-style offer negotiation — let a seller counter a buyer's offer (not just accept/decline), and let the buyer accept, decline, or counter back, repeatedly, until someone accepts or declines. Fills the "Counter-offer" parity-matrix row.

## Product decisions (locked)
1. **Latest amount only** — no offer-history table. `offerCents` holds the single current proposed amount; the bundle `status` encodes whose turn it is (`SUBMITTED` = seller's turn, `COUNTERED` = buyer's turn).
2. **Simple bounds** — every proposed amount (buyer offers and seller/buyer counters alike) must satisfy the existing `offerError`: `0 < amount ≤ listed total`. No directional/monotonic rule.
3. **Unlimited rounds** — `SUBMITTED ⇄ COUNTERED` can ping-pong indefinitely until accept/decline.

## Out of scope
- Offer history / negotiation thread (decision 1). Could fold into messaging/notifications later.
- Offer expiry / time limits (no expiry exists today).
- Checkout of an `ACCEPTED` bundle (Phase 4c) — unchanged; `COUNTERED` never reaches checkout.

---

## State machine (`src/lib/bundle.ts`)

Current statuses: `OPEN, SUBMITTED, ACCEPTED, DECLINED, CHECKED_OUT`. **Add `COUNTERED`.**

The buyer's "re-counter" is just **submitting a new offer from `COUNTERED`** — so `submitOffer` is widened rather than adding a separate buyer-counter action.

Updated `TRANSITIONS`:
```ts
const TRANSITIONS: Record<BundleAction, { from: BundleStatus[]; to: BundleStatus }> = {
  addItem:        { from: ["OPEN", "DECLINED"], to: "OPEN" },        // unchanged — items frozen during negotiation
  removeItem:     { from: ["OPEN", "DECLINED"], to: "OPEN" },        // unchanged
  submitOffer:    { from: ["OPEN", "DECLINED", "COUNTERED"], to: "SUBMITTED" }, // WIDENED: +COUNTERED (buyer re-counter)
  withdrawOffer:  { from: ["SUBMITTED"], to: "OPEN" },               // unchanged
  accept:         { from: ["SUBMITTED"], to: "ACCEPTED" },           // unchanged (seller accepts buyer offer)
  decline:        { from: ["SUBMITTED"], to: "DECLINED" },           // unchanged (seller declines)
  sellerCounter:  { from: ["SUBMITTED"], to: "COUNTERED" },          // NEW
  acceptCounter:  { from: ["COUNTERED"], to: "ACCEPTED" },           // NEW (buyer accepts seller counter)
  declineCounter: { from: ["COUNTERED"], to: "DECLINED" },           // NEW (buyer declines counter)
};
```
- `BundleAction` gains `"sellerCounter" | "acceptCounter" | "declineCounter"`.
- `BundleStatus` gains `"COUNTERED"`.
- `ACTIVE_BUNDLE_STATUSES` → `["OPEN","SUBMITTED","COUNTERED","ACCEPTED","DECLINED"]` (5). `COUNTERED` is an active negotiation, visible in the bag.
- `PURCHASABLE` → `["OPEN","SUBMITTED","COUNTERED","ACCEPTED"]` (4). `COUNTERED` has bag weight (counts in the header badge), like `SUBMITTED`.
- `offerError` is unchanged and reused for **all** proposed amounts (buyer offers and seller counters).

`offerCents` semantics across the machine:
- `submitOffer` (incl. from `COUNTERED`) → `offerCents` = buyer's new proposed total.
- `sellerCounter` → `offerCents` = seller's counter total.
- `accept` / `acceptCounter` → status `ACCEPTED`, `offerCents` unchanged (it is the agreed total — buyer's offer on `accept`, seller's counter on `acceptCounter`).
- `decline` / `declineCounter` → status `DECLINED` (leave `offerCents`; `DECLINED` UI ignores it, and `addToBundle` clears it when reviving to `OPEN`).
- `withdrawOffer` → `OPEN`, `offerCents` null (unchanged).

---

## Migration (additive — same guardrail as Section C)

Add `COUNTERED` to the `BundleStatus` Postgres enum:
```prisma
enum BundleStatus {
  OPEN
  SUBMITTED
  COUNTERED
  ACCEPTED
  DECLINED
  CHECKED_OUT
}
```
`npx prisma migrate dev --name add_countered_status` generates an `ALTER TYPE "BundleStatus" ADD VALUE 'COUNTERED'`. This is additive (no data change).

> ⚠️ **Migration guardrail (execution-critical):** confirm `DIRECT_URL` points at the dev project before migrating. Adding an enum value is additive. **If `prisma migrate dev` proposes or requires a database RESET / reports drift, STOP and escalate — never accept a reset.** (Note: `ALTER TYPE … ADD VALUE` runs outside a transaction; Prisma handles this in its own migration step. If the migration errors for that reason rather than applying, report it — do not hand-edit the DB.)

---

## Actions

### Seller — `src/app/sell/offers/actions.ts`
Add alongside `respondToOffer`:
```ts
export async function counterOffer(bundleId: string, counterDollars: string): Promise<ActionResult>;
```
- `const { storefrontId } = await requireSeller();`
- Parse `counterDollars` via `dollarsToCents`; null → `{ error: "Enter a valid amount." }`.
- Load the bundle's items scoped to `{ id: bundleId, storefrontId, status: "SUBMITTED" }` (must be a pending offer on the seller's own storefront); if not found → `{ error: "This offer is no longer pending." }`.
- Compute `listed = listedTotalCents(items)`; `const err = offerError(counterCents, listed); if (err) return { error: err };`
- Atomic guard: `updateMany({ where: { id, storefrontId, status: "SUBMITTED" }, data: { status: "COUNTERED", offerCents: counterCents } })`; `count === 0` → `{ error: "This offer is no longer pending." }`.
- `revalidatePath("/sell/offers")`.

`respondToOffer` is unchanged (accept/decline from `SUBMITTED`).

### Buyer — `src/app/bag/actions.ts`
- Define a new constant `OFFERABLE = ["OPEN", "DECLINED", "COUNTERED"] as const` (states from which a buyer may submit/re-submit an offer). Keep `EDITABLE = ["OPEN", "DECLINED"]` for add/remove/clear (items stay frozen during a counter).
- **Widen `submitOffer`**: replace its two `status: { in: [...EDITABLE] }` guards (the load query and the atomic `updateMany`) with `{ in: [...OFFERABLE] }`. Everything else (offerError, listed-total, revalidate) is unchanged. This makes a buyer re-counter (`COUNTERED → SUBMITTED`) reuse `submitOffer`.
- Add:
```ts
export async function acceptCounter(bundleId: string): Promise<ActionResult>;
export async function declineCounter(bundleId: string): Promise<ActionResult>;
```
  - `acceptCounter`: `verifySession`; `updateMany({ where: { id, buyerId: userId, status: "COUNTERED" }, data: { status: "ACCEPTED" } })` (leave `offerCents` = agreed seller counter); `count === 0` → `{ error: "This counter is no longer available." }`; `revalidatePath("/bag")`.
  - `declineCounter`: same guard, `data: { status: "DECLINED" }`; `count === 0` → `{ error: "This counter is no longer available." }`; `revalidatePath("/bag")`.

All four guards are ownership- + state-scoped atomic `updateMany`/`findFirst`, matching the existing no-IDOR pattern.

---

## UI

### Seller offers page — `src/app/sell/offers/page.tsx`
- Query `status: { in: ["SUBMITTED", "COUNTERED"] }` (was `"SUBMITTED"`), ordered `updatedAt: "asc"`.
- The "{n} pending" badge counts only `SUBMITTED` (awaiting the seller); compute `pending = offers.filter(o => o.status === "SUBMITTED").length`.
- Per bundle:
  - `SUBMITTED`: show "Offered $X" (as today) + `<OfferActions>` (Accept / Decline / Counter).
  - `COUNTERED`: show "You countered $Y" + a muted "Awaiting buyer" line; NO actions (it's the buyer's turn).

### `OfferActions` — `src/components/sell/OfferActions.tsx`
- Add a counter control: an `Input` (USD, `aria-label="Counter amount in USD"`) + a "Counter" `Button` that calls `counterOffer(bundleId, value)`. Keep Accept / Decline. Use the existing `run`/`useTransition`/`FieldError` pattern; on success `router.refresh()`.

### Bag page — `src/app/bag/page.tsx`
- `OFFER_BADGE` += `COUNTERED: { tone: "rose", label: "Seller countered" }`.
- The amount line: show for `SUBMITTED` → label "Your offer"; `COUNTERED` → label "Seller's counter"; `ACCEPTED` → label "Agreed price". (All read `b.offerCents`.) Implement as a small label lookup by status; do not show for `OPEN`/`DECLINED`.

### `BagControls` — `src/components/bag/BagControls.tsx`
- Widen the `status` prop type to include `"COUNTERED"`.
- Add a `COUNTERED` branch (mutually exclusive with the `editable` offer input):
  - Accept button → `acceptCounter(bundleId)`.
  - Decline button → `declineCounter(bundleId)`.
  - A counter input (USD) + "Counter" button → `submitOffer(bundleId, value)` (re-counter; reuses the existing action).
- The existing `editable` (OPEN/DECLINED) add/remove/clear/send-offer block and the `SUBMITTED` withdraw button are unchanged. `COUNTERED` is not `editable`, so items can't be changed mid-negotiation.
- Import `acceptCounter`, `declineCounter` from `@/app/bag/actions`.

---

## Error handling
- All counter/accept/decline actions use ownership- + status-scoped atomic guards; a stale or non-owned bundle yields a user-facing `{ error }` and no state change (no IDOR, no race window).
- `offerError` rejects counters that are ≤ 0 or above the live listed total (e.g. items went non-LIVE mid-negotiation lowering the total).
- A buyer re-counter from a bundle that the seller has meanwhile accepted/declined fails the `OFFERABLE` guard → `{ error }`.

## Testing
- **Vitest** (`src/lib/bundle.test.ts`, extend): `submitOffer` allowed from `OPEN`/`DECLINED`/`COUNTERED` (not `SUBMITTED`/`ACCEPTED`); `sellerCounter` only `SUBMITTED → COUNTERED`; `acceptCounter`/`declineCounter` only from `COUNTERED`; `nextStatus` for the three new actions; updated length asserts (`ACTIVE_BUNDLE_STATUSES.length === 5`, `PURCHASABLE.length === 4`, and `COUNTERED` ∈ both).
- **DB smoke** (`scripts/smoke-counter.ts`, mirrors `scripts/smoke-bundle.ts`): seed buyer + seller storefront + 2 LIVE listings + a SUBMITTED bundle; assert the ping-pong at the data layer via ownership-scoped `updateMany`: seller counter (wrong storefront `count===0`, right storefront `count===1`, SUBMITTED→COUNTERED); buyer re-counter (COUNTERED→SUBMITTED); seller accept (SUBMITTED→ACCEPTED); and a decline path (COUNTERED→DECLINED). Assert `offerError(total+1, total) !== null`. FK-safe cleanup.
- **Playwright** (`e2e/counter-offer.spec.ts`, building on `buyer-offer.spec.ts`): factory seller + 2 LIVE listings + real buyer; buyer adds items + sends an offer; seller counters (enter amount → "Counter"); buyer sees "Seller countered $Y", counters back; seller accepts; buyer sees "Offer accepted". Identity switches via `context.clearCookies()` + `signIn`. Use web-first auto-retrying assertions and settle buttons before asserting amounts (the Section B/C count-race lesson). Zero residue via existing teardown (bundles cascade-clean).

## Verification honesty
- The pure state machine + smoke + E2E are runtime-verifiable locally (live Supabase dev DB, namespaced fixtures).
- The migration is applied to the live dev DB; confirm `DIRECT_URL` first.
- The signed-in human click-through (offer → counter → counter-back → accept) is the final confirmation, consistent with the rest of the project.

## Build order (for the plan)
1. State machine: `bundle.ts` (+`COUNTERED`, transitions, status sets) + extend `bundle.test.ts`.
2. Migration: `BundleStatus += COUNTERED`; `prisma migrate dev` + `prisma generate` (guardrailed).
3. Seller `counterOffer` action.
4. Buyer `acceptCounter`/`declineCounter` + widen `submitOffer` to `OFFERABLE`; `scripts/smoke-counter.ts`.
5. `OfferActions` counter UI + seller offers page (`SUBMITTED`+`COUNTERED`).
6. Bag page badge/label + `BagControls` `COUNTERED` branch.
7. `e2e/counter-offer.spec.ts`; lint/test/build green.
