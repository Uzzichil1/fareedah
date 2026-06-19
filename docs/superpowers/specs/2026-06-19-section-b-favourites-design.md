# Section B — Favourites (likes) — Design Spec

**Roadmap:** Section B in `docs/superpowers/yaga-parity-roadmap.md`.
**Goal:** Yaga-style favouriting — a heart on every listing that logged-in users can toggle, plus a `/favourites` page listing their saved items. Fills two missing buyer pages on the parity matrix (Favourites page; heart on cards/detail).

## Product decisions (locked)
1. **Anonymous heart → redirect to `/login`.** The heart is visible to everyone; tapping it while logged out routes to `/login`.
2. **Stale favourites stay visible.** Items that sold / were archived / removed while favourited still appear on `/favourites`, rendered dimmed + labelled "No longer available" (not purchasable). The buyer keeps their saved history.
3. **No public favourite counts in v1.** The heart is a personal save toggle; no like-count is displayed anywhere.

## Out of scope
- Favourite counts / social proof (decision 3).
- Notifications when a favourited item drops in price or sells (belongs to Section F).
- Following shops (Section C).

---

## Data model
The `Favorite` model already exists and needs **no migration**:

```prisma
model Favorite {
  id        String   @id @default(cuid())
  userId    String
  listingId String
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  listing   Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)
  @@unique([userId, listingId])
  @@index([listingId])
}
```

`onDelete: Cascade` on both relations means deleting a user or listing removes their favourites — so existing E2E teardown (which deletes users/listings) already cleans up favourites with no new teardown logic.

---

## Components

### 1. `src/lib/dal.ts` — optional session helper (new)
Add a non-redirecting reader alongside `verifySession`:

```ts
/** Returns the current user's id, or null if not signed in. Does NOT redirect.
 *  Memoized per request. For public pages that vary by auth state. */
export const getOptionalUserId = cache(async (): Promise<string | null> => {
  const session = await auth();
  return session?.user?.id ?? null;
});
```

Rationale: `verifySession` redirects to `/login`, which is wrong for public pages (`/`, `/store/[slug]`, `/listings/[id]`) that must render for anonymous visitors but still show filled hearts for signed-in ones.

### 2. `src/lib/favorites.ts` — data + pure helpers (new)
- `getFavoritedListingIds(userId: string, listingIds: string[]): Promise<Set<string>>`
  - One query: `prisma.favorite.findMany({ where: { userId, listingId: { in } }, select: { listingId } })` → `Set`. Returns empty set if `listingIds` is empty (skip the query).
- `partitionFavorites<T extends { listing: { status: ListingStatus } }>(rows: T[]): { available: T[]; unavailable: T[] }`
  - **Pure** function (no DB). `available` = listing status `LIVE`; `unavailable` = everything else (SOLD/ARCHIVED/REJECTED/PENDING_REVIEW/DRAFT). Preserves input order within each group. **This is the unit-tested unit.**

### 3. `src/app/favourites/actions.ts` — toggle action (new)
```ts
"use server";
export type ToggleResult = { favorited: boolean } | { error: string };

export async function toggleFavorite(listingId: string): Promise<ToggleResult>;
```
Behaviour:
- `const { userId } = await verifySession();` — redirects anon to `/login` (defence in depth; the client island also guards).
- Look up existing `Favorite` for `(userId, listingId)`.
  - Exists → `delete` → return `{ favorited: false }`.
  - Missing → `create` → return `{ favorited: true }`. Wrap create in try/catch for `P2002` (unique race): treat as already-favourited → `{ favorited: true }`.
- Optionally validate the listing exists; if not, return `{ error }`. (Cheap guard; a favourite of a deleted listing is harmless but pointless.)
- `revalidatePath("/favourites")` so the favourites page reflects the change on next visit. No revalidation of `/` needed — the heart is client-optimistic.

### 4. `src/components/listings/FavoriteButton.tsx` — heart island (new, `"use client"`)
Props: `{ listingId: string; initialFavorited: boolean; isAuthenticated: boolean; variant?: "overlay" | "inline" }`.
- `overlay` (default): icon-only heart, absolutely positioned top-right, for cards.
- `inline`: heart + "Favourite"/"Favourited" label, for the listing detail page.
- Renders a `<button>`. On click:
  - `e.preventDefault(); e.stopPropagation();` — the overlay button is nested inside the card's `<Link>`, so it must not trigger navigation.
  - If `!isAuthenticated` → `router.push("/login")`.
  - Else: optimistic local state flip + `useTransition` → `await toggleFavorite(listingId)`; on `{ error }` or thrown, revert and (inline variant) surface via `FieldError`.
- Accessibility: `aria-pressed={favorited}`, `aria-label` = "Add to favourites" / "Remove from favourites". Tap target ≥ 44px (matches the project's C3 mobile rule). Filled vs outline heart by state.

### 5. `src/components/listings/ListingCard.tsx` — render the heart (edit)
- Add optional props **outside** the `listing` object: `isFavorited?: boolean`, `isAuthenticated?: boolean`, `unavailable?: boolean`.
- When `isAuthenticated`/`isFavorited` props are supplied, render `<FavoriteButton variant="overlay" …>` over the image (top-right; replaces/sits beside the condition chip which is top-left — no collision).
- When `unavailable` is true: render the card **without** the `<Link>` wrapper (use a plain `<div>`), dim the image (`opacity-60`), and overlay a centred "No longer available" pill. The heart remains rendered and toggle-able (so the buyer can un-save it) — it is a sibling of the dimmed image, not affected by the dimming.
- Card stays backward-compatible: with none of the new props it renders exactly as today (no heart). Callers opt in.

### 6. Pages

**`src/app/(home)/page.tsx`** and **`src/app/store/[slug]/page.tsx`** (edit)
- `const userId = await getOptionalUserId();`
- After loading the page's listings, `const favIds = userId ? await getFavoritedListingIds(userId, listings.map(l => l.id)) : new Set();`
- Pass `isAuthenticated={!!userId}` and `isFavorited={favIds.has(l.id)}` to each `ListingCard`.
- Public LIVE-only query (`buildListingWhere`) is unchanged — the favourites overlay does not affect the visibility invariant.

**`src/app/listings/[id]/page.tsx`** (edit)
- Load favourited state for this one listing (`getOptionalUserId` + a single `favorite.findUnique`).
- Render `<FavoriteButton variant="inline" …>` near the price/Add-to-bag area.

**`src/app/favourites/page.tsx`** (new)
- `const { userId } = await verifySession();` — login-gated page (anon → `/login`).
- Query the user's favourites, newest first, including the listing + first image + brand/size/condition + storefront slug + status.
- `partitionFavorites(rows)` → render `available` first (normal cards, `isFavorited`), then `unavailable` (dimmed, `unavailable` prop). All hearts `isFavorited=true`, `isAuthenticated=true`.
- Empty state ("No favourites yet — tap the heart on anything you love.") consistent with the home empty state styling.
- Unhearting an item here calls `toggleFavorite` (optimistic in the button) and `router.refresh()` to drop it from the list on the next render.

**`src/app/favourites/loading.tsx`** (new)
- Skeleton reusing `SkeletonHeader` + `SkeletonCard` from `src/components/skeletons/Skeletons.tsx`, matching the existing route-skeleton pattern.

**`src/components/site/SiteHeader.tsx`** (edit)
- Add a "Favourites" link → `/favourites` (heart glyph optional). Visible to everyone; an anonymous click lands on `/favourites`, which redirects to `/login` via `verifySession`.

---

## Routing / naming
- Route: **`/favourites`**; UI copy "Favourites" (British spelling, matches Yaga and the approved homepage mockup).
- Code & DB identifiers stay `favorite` / `Favorite` (no churn to the existing model).

---

## Error handling
- Toggle action: unique-constraint race → treated as success (idempotent). Missing listing → `{ error }`, surfaced only on the inline variant; the overlay variant silently reverts.
- Anonymous: guarded twice — client island routes to `/login`; the action's `verifySession` redirects too.
- `/favourites` for anon: `verifySession` redirect to `/login`.

## Testing
- **Vitest** (`src/lib/favorites.test.ts`): `partitionFavorites` — LIVE→available; SOLD/ARCHIVED/REJECTED→unavailable; order preserved; empty input.
- **DB smoke** (`scripts/smoke-favorites.ts`, mirrors `scripts/smoke-bundle.ts`): toggle on → row exists; toggle off → row gone; double-on is idempotent (one row).
- **Playwright** (`e2e/favorites.spec.ts`):
  1. Factory seller + 1 LIVE listing; real buyer signup.
  2. Buyer hearts the item on `/` → heart shows filled.
  3. `/favourites` shows the item.
  4. Unheart on `/favourites` → item leaves the list (after refresh) → zero residue.
  5. Anonymous: clearing cookies, clicking the heart on `/` → lands on `/login`.
  - Reuses existing factories/teardown; favourites cascade-delete with the user/listing, so `expectZeroResidue` passes without new teardown code.
- a11y: optionally add `/favourites` to `e2e/a11y.spec.ts` (no new critical violations).

## Verification honesty
- `partitionFavorites` + smoke + E2E are runtime-verifiable locally (live Supabase dev DB, namespaced fixtures).
- Login-gated `/favourites` render is build- + redirect-verifiable; a signed-in human click-through (heart → favourites → unheart) is the final confirmation, consistent with how other gated pages in this project are signed off.

## Build order (for the plan)
1. `getOptionalUserId` + `src/lib/favorites.ts` (+ vitest for `partitionFavorites`).
2. `toggleFavorite` action + `scripts/smoke-favorites.ts`.
3. `FavoriteButton` island.
4. `ListingCard` props (heart + unavailable).
5. Wire `/` + `/store/[slug]` + `/listings/[id]`.
6. `/favourites` page + `loading.tsx` + `SiteHeader` link.
7. `e2e/favorites.spec.ts`; lint/test/build green.
