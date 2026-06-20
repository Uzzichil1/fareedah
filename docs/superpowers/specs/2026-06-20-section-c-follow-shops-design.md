# Section C — Follow shops — Design Spec

**Roadmap:** Section C in `docs/superpowers/yaga-parity-roadmap.md`.
**Goal:** Yaga-style shop following — follow/unfollow a seller storefront, see a public follower count, and a `/following` feed of recent listings from shops you follow. Fills the "Following / followed-shops feed" parity-matrix row.

## Product decisions (locked)
1. **`/following` = a feed of recent items.** Chronological grid of LIVE listings from all shops the user follows (like the home grid, scoped to followed shops).
2. **Follower count is public.** The shop page shows "N followers".
3. **Follow button on the shop page AND on each listing detail page** (near "Sold by").
4. **Anon follow → redirect to `/login`** (same as the Section B heart).
5. **You cannot follow your own shop** — the button is hidden when the viewer owns the storefront, and the action rejects it server-side.

## Out of scope
- Notifications when a followed shop posts a new item / drops a price (Section F).
- "Suggested shops to follow" / discovery of shops.
- A standalone "list of shops you follow" page (decision 1 chose the item feed; the feed page may show followed-shop context but the primary content is items).

---

## Data model (NEW — requires a migration)

Add a `Follow` join model:

```prisma
model Follow {
  id           String   @id @default(cuid())
  followerId   String
  storefrontId String
  createdAt    DateTime @default(now())
  follower   User       @relation(fields: [followerId], references: [id], onDelete: Cascade)
  storefront Storefront @relation(fields: [storefrontId], references: [id], onDelete: Cascade)
  @@unique([followerId, storefrontId])
  @@index([storefrontId])
}
```

Add the back-relations:
- `User`  → `following  Follow[]`
- `Storefront` → `followers Follow[]`

`onDelete: Cascade` on both relations means deleting a user or storefront removes the follows — so the existing E2E teardown (which deletes users/storefronts) cleans up follows with no new teardown logic, exactly as with `Favorite`.

**Migration:** this is the first Section C/B change that alters the schema. Apply to the live Supabase dev DB via the project convention: confirm the `DIRECT_URL` target, then `npx prisma migrate dev --name add_follow` followed by `npx prisma generate`. The generated client lives at `@/generated/prisma/client`.

---

## Components

### 1. `src/lib/follows.ts` — pure helper (new, vitest)
```ts
/** Prisma `where` for the "shops you follow" feed. ALWAYS LIVE-pinned. An empty
 *  follow set yields `storefrontId: { in: [] }`, which matches NOTHING — the
 *  feed must never fall back to showing all listings. Pure (no DB import). */
export function followingFeedWhere(storefrontIds: string[]): {
  status: "LIVE";
  storefrontId: { in: string[] };
} {
  return { status: "LIVE", storefrontId: { in: storefrontIds } };
}
```
**This is the unit-tested unit** — it carries the visibility invariant (always `status:"LIVE"`; empty set matches nothing). Kept pure (no prisma/`server-only`) so vitest can import it, matching the `favorites.ts` split.

### 2. `src/lib/follows-data.ts` — data helpers (new, server; no `server-only`, matching `db.ts`/`favorites-data.ts` so smoke scripts can import)
- `isFollowing(userId: string, storefrontId: string): Promise<boolean>` — `findUnique` on the compound key `followerId_storefrontId`, return `!!row`.
- `getFollowerCount(storefrontId: string): Promise<number>` — `prisma.follow.count({ where: { storefrontId } })`.
- `getFollowedStorefrontIds(userId: string): Promise<string[]>` — `findMany({ where: { followerId: userId }, select: { storefrontId: true } })` → mapped array.

### 3. `src/app/following/actions.ts` — toggle action (new)
```ts
"use server";
export type FollowResult = { following: boolean } | { error: string };
export async function toggleFollow(storefrontId: string): Promise<FollowResult>;
```
Behaviour:
- `const { userId } = await verifySession();` — redirects anon to `/login` (defence in depth; the client island also guards).
- Look up existing `Follow` for `(followerId: userId, storefrontId)`.
  - Exists → `delete` → `revalidatePath("/following")` → return `{ following: false }`. (Delete always allowed.)
  - Missing → **gate before create:** `findUnique` the storefront (`select: { userId: true }`). If it doesn't exist → `{ error: "This shop is no longer available." }`. If `storefront.userId === userId` → `{ error: "You can't follow your own shop." }`. Otherwise `create` → `revalidatePath("/following")` → return `{ following: true }`. Wrap create in try/catch for `P2002` (unique race) → treat as already-following → `{ following: true }`.
- The gate (storefront exists + not self) mirrors the Section B LIVE-gate discipline: never create a follow to a non-existent shop, and enforce the no-self-follow rule server-side, not just by hiding the button.

### 4. `src/components/store/FollowButton.tsx` — client island (new, `"use client"`)
Props: `{ storefrontId: string; initialFollowing: boolean; isAuthenticated: boolean }`.
- Renders a `<button>`. On click:
  - If `!isAuthenticated` → `router.push("/login")`.
  - Else: optimistic local-state flip + `useTransition` → `await toggleFollow(storefrontId)`; on `{ error }` or thrown → revert; on success → set to returned state and `router.refresh()` (so the follower count and `/following` feed reconcile).
- Local state initialised with `useState(initialFollowing)` — NOT derived from the prop on re-render (same rationale as `FavoriteButton`); the component is keyed by `storefrontId`.
- Accessibility: `aria-pressed={following}`; `aria-label` = "Follow this shop" / "Unfollow this shop". Visible text "Follow" / "Following". Tap target ≥44px. `disabled={pending}`.
- Styled as a pill button consistent with the existing `Button`/header pills (e.g. rose primary when not following, outline/surface when following). One variant is sufficient (used on both the shop header and the listing detail).

### 5. Pages

**`src/app/store/[slug]/page.tsx`** (edit)
- The storefront `findUnique` (no `select`) already returns scalar `userId`. Compute:
  ```ts
  const userId = await getOptionalUserId();
  const followerCount = await getFollowerCount(storefront.id);
  const following = userId ? await isFollowing(userId, storefront.id) : false;
  const isOwnShop = userId === storefront.userId;
  ```
- In the identity `<header>` (after the name/bio), render "{followerCount} {followers/follower}" and, when `!isOwnShop`, the `<FollowButton storefrontId={storefront.id} initialFollowing={following} isAuthenticated={!!userId} />`.
- Existing favourite wiring (the listings grid + `favIds`) is untouched.

**`src/app/listings/[id]/page.tsx`** (edit)
- The listing query already includes `storefront: { select: { name, slug, userId } }`. Compute `following`/`isOwnShop` for the listing's storefront (reuse the existing `viewerId`):
  ```ts
  const isOwnShop = viewerId === listing.storefront.userId;
  const followingShop = viewerId ? await isFollowing(viewerId, listing.storefrontId) : false;
  ```
  (`listing.storefrontId` is a scalar on the listing.)
- In the "Sold by" box, when `!isOwnShop`, render `<FollowButton storefrontId={listing.storefrontId} initialFollowing={followingShop} isAuthenticated={!!viewerId} />` next to the shop link.

**`src/app/following/page.tsx`** (new)
- `const { userId } = await verifySession();` — login-gated (anon → `/login`).
- `const followedIds = await getFollowedStorefrontIds(userId);`
- If `followedIds.length === 0` → render the empty state ("You're not following any shops yet. Follow a shop to see their new arrivals here.") and stop.
- Else query the feed (reuse the home page's pagination shape — `PAGE_SIZE`, `page` from `searchParams`):
  ```ts
  const where = followingFeedWhere(followedIds);
  const [listings, total] = await Promise.all([
    prisma.listing.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page-1)*PAGE_SIZE, take: PAGE_SIZE,
      include: { images: { orderBy: { position: "asc" }, take: 1 }, brand: { select: { name: true } }, size: { select: { label: true } }, condition: { select: { name: true } } } }),
    prisma.listing.count({ where }),
  ]);
  ```
- Compute `favIds = await getFavoritedListingIds(userId, listings.map(l => l.id))` and render the grid with `ListingCard` (`isAuthenticated`, `isFavorited`) — identical card treatment to home, so hearts work in the feed.
- Pagination nav identical to home (`pageHref` helper, "Page N of M").
- A second empty state when `followedIds.length > 0` but `total === 0` ("The shops you follow have no items for sale right now.").

**`src/app/following/loading.tsx`** (new)
- Skeleton reusing `SkeletonHeader` + `SkeletonCard` from `src/components/skeletons/Skeletons.tsx`, same grid as `/favourites`'s loading.

**`src/components/site/SiteHeader.tsx`** (edit)
- Add a "Following" text link in the desktop `<nav>` (after "Favourites"). An anonymous click lands on `/following`, which redirects to `/login` via `verifySession`. (No icon needed; the nav already carries Shop/Favourites/Sell/Account.)

---

## Routing / naming
- Route: `/following`; UI copy "Following".
- Code & DB identifiers: `Follow` / `follow` / `following`.

## Error handling
- Toggle action: `P2002` race → treated as success (idempotent). Non-existent storefront → `{ error }`. Self-follow → `{ error }`. The overlay button reverts silently on `{ error }` (the error paths are unreachable through the UI, since the button is hidden on own shops and shops are real).
- Anonymous: guarded twice — client island routes to `/login`; the action's `verifySession` redirects too.
- `/following` for anon: `verifySession` redirect to `/login`.

## Testing
- **Vitest** (`src/lib/follows.test.ts`): `followingFeedWhere` — always `status:"LIVE"`; empty ids → `storefrontId.in === []` (matches nothing); ids passed through unchanged.
- **DB smoke** (`scripts/smoke-follows.ts`, mirrors `scripts/smoke-favorites.ts`): follow → row exists + `getFollowerCount` is 1 + `isFollowing` true; duplicate follow hits the unique constraint (P2002); `getFollowedStorefrontIds` returns the shop; the feed query (`followingFeedWhere` + prisma) returns the shop's LIVE listing but NOT a SOLD one; unfollow → row gone + count 0. Cleanup FK-safe (follow → listing → storefront → user).
- **Playwright** (`e2e/follows.spec.ts`):
  1. Factory seller + storefront + 1 LIVE listing; real buyer (createUser + signInAs).
  2. Buyer visits `/store/<slug>` → clicks Follow → button shows "Following", count shows "1 follower".
  3. `/following` shows the seller's LIVE item.
  4. Unfollow (on the shop page) → button back to "Follow".
  5. Anonymous (clear cookies): clicking Follow on `/store/<slug>` → lands on `/login`.
  6. Own-shop: sign in AS the seller, visit own `/store/<slug>` → Follow button absent.
  - Reuses existing factories/teardown; follows cascade-delete with the user/storefront, so `expectZeroResidue` passes without new teardown code.
- a11y: optionally add `/following` to `e2e/a11y.spec.ts` (no new critical violations).

## Verification honesty
- `followingFeedWhere` + smoke + E2E are runtime-verifiable locally (live Supabase dev DB, namespaced fixtures).
- The migration is applied to the live dev DB during the build; confirm `DIRECT_URL` first.
- Login-gated `/following` render is build- + redirect-verified; the signed-in human click-through (follow → feed → unfollow) is the final confirmation, consistent with the rest of the project.

## Build order (for the plan)
1. Migration: add `Follow` model + back-relations; `prisma migrate dev --name add_follow` + `prisma generate`.
2. `src/lib/follows.ts` (+ vitest for `followingFeedWhere`) and `src/lib/follows-data.ts`.
3. `toggleFollow` action + `scripts/smoke-follows.ts`.
4. `FollowButton` island.
5. Wire `/store/[slug]` (count + button) and `/listings/[id]` (button by "Sold by").
6. `/following` page + `loading.tsx` + `SiteHeader` link.
7. `e2e/follows.spec.ts`; lint/test/build green.
