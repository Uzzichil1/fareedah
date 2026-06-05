# Phase 3c — Public discovery (design spec)

**Date:** 2026-06-05
**Branch:** `phase-3c-discovery`
**Status:** Approved (ready for implementation planning)

## 1. Purpose & scope

> Anyone (no login) can **browse `LIVE` listings**, filter/search them, open a
> **listing detail page**, and view a **seller's storefront page**.

This is sub-phase 3c of Phase 3 — the public, buyer-facing surface that finally
makes approved (`LIVE`) listings visible. Built on 3a (listings) and 3b
(approval → `LIVE`). It is **display-only**: no cart/checkout (P4), no favorites
(P5), no buy button yet.

**Acceptance surface:** the public pages themselves — and because everything is
public (no auth, no Cloudinary needed), **3c is fully runtime-smoke-testable by
an automated agent**, the strongest verification surface of the project so far.

### Deferred
- Add-to-cart / checkout / payments (P4).
- Favorites / wishlist (P5).
- Seller following, reviews, advanced relevance ranking.

## 2. The security invariant — public queries are pinned to `LIVE`

**The single most important correctness property of 3c:** the public must only
ever see `LIVE` listings. Drafts, pending-review, rejected, sold, and archived
listings must never leak.

- The shared `buildListingWhere(params)` function sets **`status: "LIVE"`
  unconditionally** and **ignores any client-supplied `status` param** (a buyer
  must not be able to widen the query via `?status=DRAFT`).
- All three public data paths are pinned to `LIVE`:
  - browse grid (`/`),
  - listing detail (`/listings/[id]` — `notFound()` if the listing is missing
    **or not `LIVE`**),
  - storefront (`/store/[slug]` — only that storefront's `LIVE` listings).
- This is the public-leak analog of the IDOR checks in 3a/3b: it is a spec
  requirement, an acceptance criterion (§7), a unit test, and a reviewer grep.

## 3. Browse grid — home page `/`

Replace the Phase 1 landing page with the shop. Layout (functional, bare
Tailwind — no design system, consistent with prior phases):
- a small **branded header** (TinyKloset name/tagline) above the grid,
- a **filter bar**, and
- a **grid of listing cards**.

### Filtering (server-side, from URL query params)
The page reads `searchParams` (a **Promise** in this Next 16 — `await` it) and
passes parsed values to `buildListingWhere`. Supported params:
- `category` — **leaf categories only** (see §6); `categoryId = <id>`.
- `size` — `sizeId = <id>`.
- `condition` — `conditionId = <id>`.
- `brand` — `brandId = <id>`.
- `priceMin` / `priceMax` — dollar strings parsed to integer cents via
  `dollarsToCents`; the price filter is **omitted** when a bound is missing or
  unparseable (never coerce a bad value to 0).
- `q` — case-insensitive title search: `{ title: { contains: q, mode:
  "insensitive" } }`.
- `sort` — mapped through a **fixed whitelist** to an `orderBy` (unknown values
  ignored → default): `newest` (`createdAt desc`, default), `price_asc`
  (`priceCents asc`), `price_desc` (`priceCents desc`). Client strings are never
  passed raw to `orderBy`.
- `page` — 1-based; **page size 24** (offset pagination).

A GET filter form (selects for category/size/condition/brand, price min/max
inputs, search box, sort select) updates the URL query. The grid shows total
count and prev/next pagination. Empty state when nothing matches.

### Listing card
A shared `ListingCard` (primary image via `next/image`, title, price via
`centsToDollars`, brand) linking to `/listings/[id]`. Used by browse and
storefront.

## 4. Listing detail — `/listings/[id]`

Public page (`params` is a Promise — `await` it). Loads the listing with its
images, brand, category, condition, size, and storefront. **`notFound()` if the
listing doesn't exist or `status !== "LIVE"`.** Renders the image gallery,
title, description, price, brand/category/condition/size, and a link to the
seller's storefront (`/store/[slug]`). Display-only — no buy/favorite actions.

## 5. Storefront — `/store/[slug]`

Public page. Loads the storefront by `slug` (`notFound()` if unknown). Shows the
storefront `name` + `bio` and a grid of **that storefront's `LIVE` listings**
(reusing `ListingCard`). Empty state if the seller has no live listings.

## 6. Category filter — leaf categories only

Listings are tagged with a **specific** category, and `Category` is a tree
(Clothing → Tops/Bottoms/…). If the filter offered a **parent** (e.g.
"Clothing") and queried `categoryId = <Clothing>`, it would return **zero**
results (listings are tagged "Tops", not "Clothing"). To avoid that trap, the
category filter offers **only leaf categories** (those with no children):
Tops, Bottoms, Dresses, Outerwear, Sleepwear, Footwear, Accessories. The
browse query does a simple `categoryId = <leaf id>`. (Parent-expansion to
`IN [parent + descendants]` is deliberately out of scope for 3c.)

A `getLeafCategories` (or filtered `getCategories`) loader provides the options;
a `getBrands` loader provides brand options.

## 7. Validation & testing

- **Pure `buildListingWhere(params)`** (`src/lib/listing-query.ts`) — params →
  Prisma `where`. Unit-tested:
  - always includes `status: "LIVE"` even with **no** params;
  - a `?status=DRAFT`-style param **cannot** override it (status is ignored as
    input);
  - each filter (category/size/condition/brand) produces the right clause;
  - price range: included only when parseable; omitted otherwise; uses cents;
  - search: case-insensitive `contains`;
  - combinations AND together.
- A pure `parseSort(sortParam)` → whitelisted `orderBy` (unknown → newest) —
  unit-tested.
- **Pages** verified by `npm run build` + an **automated public smoke**
  (controller, no auth needed): seed a `LIVE` listing (+ storefront) and a
  **non-`LIVE`** listing, then assert:
  - `GET /` shows the live listing; a too-low `priceMax` hides it; a category
    filter narrows correctly;
  - `GET /listings/<live-id>` → 200 and renders; `GET /listings/<nonlive-id>`
    → 404;
  - `GET /store/<slug>` shows the live listing;
  - the non-`LIVE` listing never appears on `/` or the storefront.
  Clean up the seeded fixtures afterward.

## 8. Acceptance criteria

1. `npm run lint`, `npm test`, `npm run build` all pass.
2. `/` renders a grid of **`LIVE`** listings with working filters (category leaf,
   size, condition, brand, price range, text search), sort (newest / price
   asc/desc), and pagination (page size 24). **Runtime-verified by the automated
   public smoke.**
3. **`LIVE`-pinning invariant:** `buildListingWhere` always pins `status:
   "LIVE"` and ignores any client `status` input (unit-tested + reviewer grep);
   a `DRAFT`/`PENDING_REVIEW`/`REJECTED`/`SOLD` listing never appears on `/` or a
   storefront, and `/listings/<non-live-id>` returns **404**. (Verify-don't-assume
   after wiring.)
4. `/listings/[id]` shows a live listing's full details + a storefront link;
   404s for missing or non-live ids.
5. `/store/[slug]` shows the storefront's name/bio + its live listings; 404s for
   unknown slugs.
6. No new login is required for any of the above (public).

## 9. No schema change

Everything 3c needs — `LIVE` listings, storefronts, taxonomy, brands — already
exists from Phase 2/3a/3b.

## 10. Risks / watch-items

- **`LIVE` leak** (§2) — the security invariant; unbypassable, tested, grepped,
  and verify-don't-assume after wiring.
- **Category zero-results trap** (§6) — leaf-only filter avoids it.
- **Case-insensitive search / sort whitelist / price robustness** (§3) —
  build-silent if wrong; covered by the where-builder unit tests.
- **`searchParams`/`params` are Promises** in this Next 16 — must be awaited.
- **Empty grid is expected** when no `LIVE` listings exist — after merge, tell
  the user to approve a listing (e.g. the seeded pending one) so `/` isn't
  confusingly empty (correct-but-looks-broken).
