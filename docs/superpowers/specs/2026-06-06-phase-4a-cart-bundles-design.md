# Phase 4a — Cart & bundles with offers (design spec)

**Date:** 2026-06-06
**Branch:** `phase-4a-cart-bundles`
**Status:** Approved (ready for implementation planning)

## 1. Purpose & scope

> A signed-in buyer can collect a seller's `LIVE` items into a **per-seller
> bundle** (their cart for that seller), optionally **send the seller an offer**
> (a proposed total), and the **seller can accept or decline** it. The buyer can
> withdraw a pending offer. The bundle ends 4a in one of two checkout-ready
> states: `OPEN` (buy at listed total) or `ACCEPTED` (buy at agreed total).

This is sub-phase 4a of Phase 4 (commerce). It is the **pre-payment** surface:
it builds the cart and the offer-negotiation flow on top of the existing
`Bundle` / `BundleItem` / `BundleStatus` models. **No money moves in 4a** —
payment, price-locking, and inventory reservation are 4c.

**Decomposition context:** Phase 4 = 4a cart/bundles → 4b Stripe Connect
seller onboarding → 4c checkout & escrow (commission + payout) → 4d Shippo
shipping → 4e messaging (independent). 4a has no dependency on Stripe.

### Deferred (explicitly NOT in 4a)
- **Payment / checkout / price-locking / the `CHECKED_OUT` transition → 4c.**
  The "Checkout" button in 4a is a stub/placeholder until 4c wires it.
- **Inventory reservation → 4c.** Accepting an offer does **not** lock the
  items or change listing status; they stay `LIVE`. Concurrency ("two buyers,
  one item") is resolved at payment in 4c — first to pay wins; the other sees
  "no longer available" at checkout.
- **Price snapshots.** Totals compute live from current listing prices; the
  price is locked into `OrderItem` only at purchase (4c).
- **Counter-offers, auto-expiry, email notifications.** Not in 4a. Offer
  visibility is **in-app only** (offers appear in the seller's dashboard).
- Cross-seller "one cart": there is **no** global multi-seller cart. Because
  payouts and offers are per-seller (Stripe Connect, per-seller `Bundle`), each
  seller's selected items are an independent bundle acted on separately.

## 2. Correctness invariants (the 4a analog of the `LIVE`-leak / IDOR rules)

These are spec requirements, acceptance criteria (§8), unit tests, and reviewer
greps — not optional.

1. **Ownership, no IDOR.**
   - A buyer may only read/mutate **their own** bundles (`bundle.buyerId ===
     session.userId`).
   - A seller may only respond to offers on **their own** storefront
     (`bundle.storefrontId === session.storefrontId`).
   - Every bundle mutation re-checks ownership server-side (mirror the
     `sell/actions.ts` / `admin/actions.ts` ownership pattern). Never trust a
     `bundleId` from the client without an ownership-scoped query.
2. **`LIVE`-only, single-seller items.** A listing can be added only if it is
   `status: "LIVE"` and belongs to the bundle's `storefrontId`. Items from a
   different storefront are rejected (a bundle is always single-seller).
3. **No self-purchase.** A buyer cannot add their **own** storefront's listing
   to a bundle.
4. **Valid state transitions only.** Each action enforces the allowed
   from-states (§4); an action on a bundle in the wrong state is a no-op error,
   not a silent corruption.
5. **Offer amount bounds.** `0 < offerCents ≤ listedTotalCents` (computed from
   current `LIVE` item prices). Reject otherwise. (An offer equal to the listed
   total is allowed; offers above it are not.)

## 3. Data model — one migration

The only change: add a proposed/agreed total to `Bundle`.

```prisma
model Bundle {
  // ...existing fields...
  offerCents Int?   // null = no offer (buy-now path). Set on SUBMITTED
                    // (proposed total); becomes the agreed price on ACCEPTED.
}
```

Everything else already exists:
- `Bundle(id, buyerId, storefrontId, status, createdAt, updatedAt)` with
  `@@index([buyerId])`, `@@index([storefrontId])`.
- `BundleItem(id, bundleId, listingId)` with `@@unique([bundleId, listingId])`
  (so an item can't be double-added) and `@@index([listingId])`.
- `BundleStatus = OPEN | SUBMITTED | ACCEPTED | DECLINED | CHECKED_OUT`.

`BundleItem` is **not** given a price column (snapshots are 4c/`OrderItem`).
Migration applied to live Supabase via the established `DIRECT_URL` flow.

### "Find-or-create the OPEN bundle"
Adding an item resolves the buyer's **single `OPEN` bundle** for that seller,
creating it if none exists. Enforced in code (find-or-create on add); historical
non-`OPEN` bundles (`DECLINED`, future `CHECKED_OUT`) coexist. At most one
`OPEN` bundle per (buyer, storefront) is expected.

**Concurrency note:** a plain find-or-create has a race — two concurrent
`addToBundle` calls (double-click, two tabs) can both create an `OPEN` bundle,
yielding two carts for one (buyer, seller). A simple `@@unique([buyerId,
storefrontId])` is **wrong** here (it would forbid the coexisting `DECLINED`/
`CHECKED_OUT` rows the design relies on). The plan must pick one mitigation:
(a) a **partial unique index** `WHERE status = 'OPEN'` (raw SQL in the
migration — Prisma won't generate it), (b) **catch-and-retry** the duplicate,
or (c) **accept the rare dup** and have `/bag` coalesce. Default recommendation:
(a) partial unique index — it makes the invariant real at the DB.

## 4. State machine (4a owns everything up to checkout)

```
OPEN ──submitOffer──▶ SUBMITTED ──respondToOffer(accept)──▶ ACCEPTED ─▶[4c]─▶ CHECKED_OUT
 │                       │  └──withdrawOffer──▶ OPEN
 │                       └──respondToOffer(decline)──▶ DECLINED ──submitOffer──▶ SUBMITTED
 │
 └────────────────── buy now (OPEN, offerCents = null) ──────────────▶[4c]─▶ CHECKED_OUT
```

- `CHECKED_OUT` is set by **4c**, never by 4a.
- From `DECLINED`, the buyer may re-offer (`→ SUBMITTED`) or buy now at listed
  price (the bundle still functions as a cart).
- `withdrawOffer` returns `SUBMITTED → OPEN` and clears `offerCents`.
- Adding/removing items is allowed only while `OPEN` or `DECLINED` (editing a
  bundle with a live `SUBMITTED`/`ACCEPTED` offer is rejected — the offer total
  would no longer match the contents). Removing the last item **deletes the
  bundle**.

## 5. Server actions (`src/app/bag/actions.ts`, mirroring existing action files)

All return `{ error }` on failure (same shape as `sell`/`admin` actions) and
re-validate auth + ownership. Buyer actions require a session; seller actions
require storefront ownership.

- `addToBundle(listingId)` — buyer-only. Loads the `LIVE` listing; rejects
  non-`LIVE`, missing, or own-storefront listings; find-or-creates the `OPEN`
  bundle for (buyer, listing.storefrontId); inserts the `BundleItem`. **A
  re-add (double-click) must be tolerated** — use `createMany({ skipDuplicates:
  true })` or catch the `(bundleId, listingId)` unique violation (`P2002`); a
  bare `create` on an existing pair throws and would 500. The unique constraint
  *prevents* the duplicate row; it does not by itself make the call idempotent.
- `removeFromBundle(bundleId, listingId)` — buyer-only; `OPEN|DECLINED` only.
- `clearBundle(bundleId)` — buyer-only; deletes the bundle (`OPEN|DECLINED`).
- `submitOffer(bundleId, offerCents)` — buyer-only; from `OPEN|DECLINED`;
  validates bounds (§2.5) against the live listed total; sets `offerCents` and
  `status = SUBMITTED`.
- `withdrawOffer(bundleId)` — buyer-only; from `SUBMITTED`; `→ OPEN`, clears
  `offerCents`.
- `respondToOffer(bundleId, accept: boolean)` — **seller-only** (storefront
  owner); from `SUBMITTED`; `→ ACCEPTED` or `→ DECLINED`.

A small pure helper module (`src/lib/bundle.ts`) holds the **transition guard**
(`canTransition(from, action)`), the **offer-amount validator**, and the
**listed-total** calculation — all unit-testable without the DB (the 4a analog
of `listing-query.ts`).

## 6. Pages / UI (uses the boutique design system from the design rollout)

- **Add-to-bag** action on listing detail (`/listings/[id]`). Shown only to a
  signed-in buyer; hidden on the buyer's own listings. Posts to `addToBundle`.
  (Add-to-bag directly from the `ListingCard` grid is deferred — the card stays
  a link in 4a.)
- **`/bag`** (buyer) — the buyer's bundles grouped by seller. Each bundle shows:
  its items (with any now-unavailable items flagged and excluded from the
  total), the **live listed total**, the offer state + `offerCents` if any, and
  actions: remove item, **Make an offer** / **Withdraw offer**, and a
  **Checkout** button (stub until 4c). Empty state when the bag is empty.
- **Seller offers** — incoming `SUBMITTED` offers on a dedicated `/sell/offers`
  page with **Accept** / **Decline** per offer, showing items + listed total +
  offered total. Uses `Badge` for status (reuse the existing status-badge
  vocabulary).
- **Bag indicator** — item/bundle count on the bag icon in `SiteHeader`.

All read paths are ownership-scoped (a buyer's `/bag` only queries their
bundles; the seller offers view only queries their storefront's bundles).

## 7. Validation & testing

- **Pure unit tests** (`src/lib/bundle.ts`, no DB):
  - `canTransition` allows exactly the §4 edges and rejects all others
    (e.g. `respondToOffer` on `OPEN`, `submitOffer` on `ACCEPTED`).
  - offer-amount validator: rejects `≤ 0` and `> listedTotal`, accepts the
    boundary `= listedTotal`.
  - listed-total computes from item prices and **excludes non-`LIVE`** items.
- **Actions / pages** verified by `npm run build` + a **seeded, authenticated
  smoke** (uses the Auth.js credentials REST flow, as in prior phases, because
  the buyer/seller actions require a session):
  - buyer adds two `LIVE` items from one seller → one `OPEN` bundle with both;
  - adding a second seller's item creates a **separate** bundle;
  - adding own listing / a non-`LIVE` listing → rejected;
  - `submitOffer` over the listed total → rejected; a valid one → `SUBMITTED`;
  - seller `respondToOffer(accept)` → `ACCEPTED`; a **different** user calling
    it → rejected (ownership);
  - buyer `withdrawOffer` → `OPEN`.
  Clean up seeded fixtures afterward.
- **Reviewer grep:** every bundle action re-checks `buyerId`/`storefrontId`
  ownership (no `bundleId`-only queries).

## 8. Acceptance criteria

1. `npm run lint`, `npm test`, `npm run build` all pass.
2. A signed-in buyer can add `LIVE` items from a seller into a per-seller
   bundle, view it at `/bag`, and remove items — runtime-verified by the
   authenticated smoke.
3. **Ownership invariant:** no buyer can read/mutate another buyer's bundle and
   no user can respond to an offer on a storefront they don't own
   (unit/smoke-tested + reviewer grep). A buyer cannot add their own listing.
4. Buyer can `submitOffer` (bounds-validated) → `SUBMITTED`; `withdrawOffer` →
   `OPEN`; seller can `respondToOffer` → `ACCEPTED`/`DECLINED`; re-offer from
   `DECLINED` works. Invalid transitions are rejected.
5. `offerCents` migration applied to live Supabase; the rest of the model
   unchanged.
6. No money moves and no listing status changes in 4a (checkout/reservation are
   visibly stubbed/deferred to 4c). (Verify-don't-assume after wiring.)

## 9. Risks / watch-items

- **IDOR on `bundleId`** — the headline risk; every action must be
  ownership-scoped (§2.1). Build-silent if wrong; tested + grepped.
- **Stale totals / unavailable items** — an item can leave `LIVE` (sold via
  another path, archived) while sitting in a bundle. `/bag` must show it
  unavailable and exclude it from the total; `submitOffer` recomputes against
  current `LIVE` items.
- **Edit-after-offer desync** — adding/removing items is blocked once an offer
  is `SUBMITTED`/`ACCEPTED` (§4) so `offerCents` can't drift from contents.
- **"Checkout looks broken"** — the Checkout button is a deliberate stub until
  4c; label it so it doesn't read as a bug.
- **Abandoned `ACCEPTED` bundles** — `withdrawOffer` is `SUBMITTED`-only, so an
  `ACCEPTED` bundle has no buyer-side release in 4a. This is intentional and
  harmless *because nothing is reserved* (items stay `LIVE`); the buyer simply
  may never check out. Cleanup/expiry of stale `ACCEPTED` bundles is **4c's**
  concern, not 4a's.
- **Authenticated smoke must really run** — 4a's surface is gated (buyer/seller
  sessions), so anonymous curl redirects to `/login` and proves nothing (this
  session hit exactly that wall on the design rollout's gated pages). The
  Auth.js-credentials REST smoke (§7) is the acceptance proof; do not let it
  silently degrade into "`build` passed."
- **Server Actions / `params`/`searchParams` are Promises** in this Next 16 —
  await them; follow the deliberately-modified Next conventions
  (`node_modules/next/dist/docs/`).
