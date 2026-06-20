# Section B — Favourites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Yaga-style favouriting — a heart toggle on every listing plus a login-gated `/favourites` page — to TinyKloset.

**Architecture:** Reuse the existing `Favorite` model (no migration). A pure `partitionFavorites` helper (vitest) splits saved items into buyable/unavailable; a `toggleFavorite` server action does the create-or-delete; a `FavoriteButton` client island renders the heart with optimistic state. `ListingCard` is restructured to a **stretched-link** card so the heart is a sibling of the card link, not a `<button>` nested inside an `<a>` (invalid HTML).

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), Prisma 7, Auth.js v5, Tailwind v4, vitest, Playwright, `tsx` smoke scripts.

**Spec:** `docs/superpowers/specs/2026-06-19-section-b-favourites-design.md`

## Global Constraints

- **No migration** — the `Favorite` model already exists (`@@unique([userId, listingId])`, both relations `onDelete: Cascade`). Do not add or alter schema.
- **Route + copy:** user-facing route is `/favourites`; UI copy is "Favourites" (British spelling). Code/DB identifiers stay `favorite`/`Favorite`.
- **Public visibility invariant unchanged:** public listing queries stay pinned to `status: "LIVE"` via `buildListingWhere`; the heart overlay must not alter which listings are queried.
- **Decisions (locked):** anon heart → `/login`; sold/archived favourites stay visible as "No longer available"; no public favourite counts.
- **Pure logic in `src/lib/*` with vitest; data/actions verified by a `tsx` smoke script; flows by Playwright.** A unit-tested lib file must NOT import `server-only` or `prisma` (vitest loads it outside an RSC context).
- **Verification honesty:** the signed-in heart click-through is the human-smoke confirmation; gated-page render is build+redirect-verified.

---

### Task 1: Favourites lib helpers + optional session reader

**Files:**
- Modify: `src/lib/dal.ts` (add `getOptionalUserId`)
- Create: `src/lib/favorites.ts` (pure `partitionFavorites` — no prisma/server-only)
- Create: `src/lib/favorites-data.ts` (server-only `getFavoritedListingIds`)
- Test: `src/lib/favorites.test.ts`

**Interfaces:**
- Produces:
  - `getOptionalUserId(): Promise<string | null>`
  - `partitionFavorites<T extends { listing: { status: string } }>(rows: T[]): { available: T[]; unavailable: T[] }`
  - `getFavoritedListingIds(userId: string, listingIds: string[]): Promise<Set<string>>`

> Note: the spec put both data + pure helpers in `favorites.ts`. They are split here because `favorites.test.ts` imports `partitionFavorites` under vitest, which cannot import `server-only`/`prisma`. Keep `favorites.ts` pure; put the DB query in `favorites-data.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/favorites.test.ts
import { describe, it, expect } from "vitest";
import { partitionFavorites } from "./favorites";

const row = (id: string, status: string) => ({ id, listing: { status } });

describe("partitionFavorites", () => {
  it("puts LIVE in available, everything else in unavailable", () => {
    const rows = [
      row("a", "LIVE"),
      row("b", "SOLD"),
      row("c", "ARCHIVED"),
      row("d", "LIVE"),
      row("e", "REJECTED"),
      row("f", "PENDING_REVIEW"),
    ];
    const { available, unavailable } = partitionFavorites(rows);
    expect(available.map((r) => r.id)).toEqual(["a", "d"]);
    expect(unavailable.map((r) => r.id)).toEqual(["b", "c", "e", "f"]);
  });

  it("preserves input order within each group", () => {
    const rows = [row("x", "SOLD"), row("y", "LIVE"), row("z", "SOLD")];
    const { available, unavailable } = partitionFavorites(rows);
    expect(available.map((r) => r.id)).toEqual(["y"]);
    expect(unavailable.map((r) => r.id)).toEqual(["x", "z"]);
  });

  it("handles an empty list", () => {
    expect(partitionFavorites([])).toEqual({ available: [], unavailable: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- favorites`
Expected: FAIL — `Cannot find module './favorites'` (or `partitionFavorites is not a function`).

- [ ] **Step 3: Write the pure helper**

```ts
// src/lib/favorites.ts
/**
 * Splits favourite rows into currently-buyable (listing status LIVE) and
 * everything else (sold/archived/etc.), preserving input order within each
 * group. Pure — no DB, no server-only, so it is safe to unit-test.
 */
export function partitionFavorites<T extends { listing: { status: string } }>(
  rows: T[],
): { available: T[]; unavailable: T[] } {
  const available: T[] = [];
  const unavailable: T[] = [];
  for (const row of rows) {
    (row.listing.status === "LIVE" ? available : unavailable).push(row);
  }
  return { available, unavailable };
}
```

- [ ] **Step 4: Write the server-only data helper**

```ts
// src/lib/favorites-data.ts
import "server-only";
import { prisma } from "@/lib/db";

/** Returns the subset of `listingIds` the user has favourited, as a Set.
 *  One query; short-circuits on an empty input. */
export async function getFavoritedListingIds(
  userId: string,
  listingIds: string[],
): Promise<Set<string>> {
  if (listingIds.length === 0) return new Set();
  const rows = await prisma.favorite.findMany({
    where: { userId, listingId: { in: listingIds } },
    select: { listingId: true },
  });
  return new Set(rows.map((r) => r.listingId));
}
```

- [ ] **Step 5: Add the optional session reader to the DAL**

In `src/lib/dal.ts`, add after `verifySession` (it already imports `cache`, `auth`):

```ts
/** Returns the current user's id, or null if not signed in. Does NOT redirect.
 *  Memoized per request — for public pages that vary by auth state. */
export const getOptionalUserId = cache(async (): Promise<string | null> => {
  const session = await auth();
  return session?.user?.id ?? null;
});
```

- [ ] **Step 6: Run tests + lint/typecheck to verify they pass**

Run: `npm test -- favorites`
Expected: PASS (3 tests).
Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/favorites.ts src/lib/favorites-data.ts src/lib/favorites.test.ts src/lib/dal.ts
git commit -m "feat(B): favourites lib helpers + getOptionalUserId"
```

---

### Task 2: `toggleFavorite` server action + DB smoke

**Files:**
- Create: `src/app/favourites/actions.ts`
- Create: `scripts/smoke-favorites.ts`

**Interfaces:**
- Consumes: `verifySession` (`src/lib/dal`), `getFavoritedListingIds` (`src/lib/favorites-data`), `partitionFavorites` (`src/lib/favorites`).
- Produces: `toggleFavorite(listingId: string): Promise<{ favorited: boolean } | { error: string }>` and the exported type `ToggleResult`.

- [ ] **Step 1: Write the action**

```ts
// src/app/favourites/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";

export type ToggleResult = { favorited: boolean } | { error: string };

/** Toggles the current user's favourite for a listing. Idempotent under a
 *  unique-constraint race (P2002 on create → treated as already favourited). */
export async function toggleFavorite(listingId: string): Promise<ToggleResult> {
  const { userId } = await verifySession();

  const existing = await prisma.favorite.findUnique({
    where: { userId_listingId: { userId, listingId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    revalidatePath("/favourites");
    return { favorited: false };
  }

  try {
    await prisma.favorite.create({ data: { userId, listingId } });
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code === "P2002") {
      // Concurrent create won the race — already favourited.
      revalidatePath("/favourites");
      return { favorited: true };
    }
    if (code === "P2003") {
      // FK violation — the listing no longer exists.
      return { error: "This item is no longer available." };
    }
    throw e;
  }

  revalidatePath("/favourites");
  return { favorited: true };
}
```

- [ ] **Step 2: Write the smoke script**

```ts
// scripts/smoke-favorites.ts
// Run with: npx tsx scripts/smoke-favorites.ts
// Seeds a buyer + a seller storefront + two listings (one LIVE, one SOLD),
// then asserts the favourite data invariants and cleans up.
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { getFavoritedListingIds } from "../src/lib/favorites-data";
import { partitionFavorites } from "../src/lib/favorites";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("SMOKE FAIL: " + msg);
  console.log("ok - " + msg);
}

async function main() {
  const stamp = Date.now();
  const buyer = await prisma.user.create({ data: { email: `smoke-fav-buyer-${stamp}@x.test` } });
  const sellerUser = await prisma.user.create({ data: { email: `smoke-fav-seller-${stamp}@x.test` } });
  const store = await prisma.storefront.create({
    data: { userId: sellerUser.id, name: `Fav ${stamp}`, slug: `smoke-fav-${stamp}` },
  });
  const category = await prisma.category.findFirstOrThrow();
  const condition = await prisma.condition.findFirstOrThrow();
  const mk = (title: string, status: "LIVE" | "SOLD") =>
    prisma.listing.create({
      data: {
        storefrontId: store.id, title, description: "smoke", priceCents: 1000,
        categoryId: category.id, conditionId: condition.id, status,
      },
    });
  const live = await mk("Smoke LIVE", "LIVE");
  const sold = await mk("Smoke SOLD", "SOLD");

  try {
    // create → exists
    await prisma.favorite.create({ data: { userId: buyer.id, listingId: live.id } });
    let ids = await getFavoritedListingIds(buyer.id, [live.id, sold.id]);
    assert(ids.has(live.id) && !ids.has(sold.id), "getFavoritedListingIds returns only saved ids");

    // re-create is rejected by the unique index (idempotency is handled in the action's P2002 catch)
    let dup = false;
    try { await prisma.favorite.create({ data: { userId: buyer.id, listingId: live.id } }); }
    catch (e: unknown) { dup = (e as { code?: string }).code === "P2002"; }
    assert(dup, "duplicate favourite hits the unique constraint (P2002)");

    // favourite the SOLD one too, then partition
    await prisma.favorite.create({ data: { userId: buyer.id, listingId: sold.id } });
    const rows = await prisma.favorite.findMany({
      where: { userId: buyer.id },
      include: { listing: { select: { status: true } } },
      orderBy: { createdAt: "asc" },
    });
    const { available, unavailable } = partitionFavorites(rows);
    assert(available.length === 1 && available[0].listing.status === "LIVE", "available holds the LIVE favourite");
    assert(unavailable.length === 1 && unavailable[0].listing.status === "SOLD", "unavailable holds the SOLD favourite");

    // delete → gone
    await prisma.favorite.deleteMany({ where: { userId: buyer.id, listingId: live.id } });
    ids = await getFavoritedListingIds(buyer.id, [live.id]);
    assert(!ids.has(live.id), "deleted favourite no longer returned");

    console.log("\nALL SMOKE CHECKS PASSED");
  } finally {
    await prisma.favorite.deleteMany({ where: { userId: buyer.id } });
    await prisma.listing.deleteMany({ where: { storefrontId: store.id } });
    await prisma.storefront.deleteMany({ where: { slug: `smoke-fav-${stamp}` } });
    await prisma.user.deleteMany({ where: { id: { in: [buyer.id, sellerUser.id] } } });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run the smoke + lint/typecheck**

Run: `npx tsx scripts/smoke-favorites.ts`
Expected: lines of `ok - …` then `ALL SMOKE CHECKS PASSED`, exit 0.
Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/favourites/actions.ts scripts/smoke-favorites.ts
git commit -m "feat(B): toggleFavorite action + data smoke"
```

---

### Task 3: `FavoriteButton` client island

**Files:**
- Create: `src/components/listings/FavoriteButton.tsx`

**Interfaces:**
- Consumes: `toggleFavorite` (`src/app/favourites/actions`).
- Produces: `FavoriteButton({ listingId, initialFavorited, isAuthenticated, variant }: { listingId: string; initialFavorited: boolean; isAuthenticated: boolean; variant?: "overlay" | "inline" })`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/listings/FavoriteButton.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleFavorite } from "@/app/favourites/actions";

type Props = {
  listingId: string;
  initialFavorited: boolean;
  isAuthenticated: boolean;
  variant?: "overlay" | "inline";
};

export function FavoriteButton({
  listingId,
  initialFavorited,
  isAuthenticated,
  variant = "overlay",
}: Props) {
  const router = useRouter();
  // Local optimistic state. Intentionally NOT derived from initialFavorited on
  // re-render — the component is keyed by listingId, so a different listing
  // remounts with fresh state; reconciliation happens via router.refresh().
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    const next = !favorited;
    setFavorited(next); // optimistic
    startTransition(async () => {
      const r = await toggleFavorite(listingId);
      if ("error" in r) {
        setFavorited(!next); // revert
      } else {
        setFavorited(r.favorited);
        router.refresh(); // reconcile server state (drops items from /favourites)
      }
    });
  }

  const label = favorited ? "Remove from favourites" : "Add to favourites";

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={favorited}
        aria-label={label}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink transition-colors hover:border-rose-soft disabled:opacity-60"
      >
        <Heart filled={favorited} />
        {favorited ? "Favourited" : "Favourite"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={favorited}
      aria-label={label}
      className="grid h-11 w-11 place-items-center rounded-full bg-surface/90 text-ink-soft shadow-[var(--shadow-card)] backdrop-blur-sm transition-colors hover:text-rose disabled:opacity-60"
    >
      <Heart filled={favorited} />
    </button>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={filled ? "text-rose" : ""}
    >
      <path d="M12 21l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.18L12 21z" />
    </svg>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors. (No isolated runtime test for the island — it is exercised by the E2E in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add src/components/listings/FavoriteButton.tsx
git commit -m "feat(B): FavoriteButton client island"
```

---

### Task 4: Restructure `ListingCard` to a stretched-link card with heart

**Files:**
- Modify: `src/components/listings/ListingCard.tsx`

**Interfaces:**
- Consumes: `FavoriteButton` (`src/components/listings/FavoriteButton`).
- Produces: `ListingCard({ listing, isFavorited, isAuthenticated, unavailable })` — `listing: ListingCardData` unchanged; new optional props `isFavorited?: boolean`, `isAuthenticated?: boolean`, `unavailable?: boolean`.

**Why:** a `<button>` nested in an `<a>` is invalid HTML (nested-interactive) and slips past the critical-only a11y gate. Make the heart a sibling of a stretched link.

- [ ] **Step 1: Replace the component body**

```tsx
// src/components/listings/ListingCard.tsx
import Link from "next/link";
import Image from "next/image";
import { centsToDollars } from "@/lib/money";
import { FavoriteButton } from "@/components/listings/FavoriteButton";

export type ListingCardData = {
  id: string;
  title: string;
  priceCents: number;
  brandName: string | null;
  sizeLabel: string | null;
  conditionName: string | null;
  imageUrl: string | null;
};

/**
 * Product card. The whole card is a single click target via a stretched link
 * (`absolute inset-0`, z-10); the optional favourite heart sits above it
 * (z-20) as a sibling — never nested inside the anchor. When `unavailable`,
 * the card is non-navigable (no link) and dimmed with an overlay label.
 */
export function ListingCard({
  listing,
  isFavorited,
  isAuthenticated,
  unavailable = false,
}: {
  listing: ListingCardData;
  isFavorited?: boolean;
  isAuthenticated?: boolean;
  unavailable?: boolean;
}) {
  // The heart renders only when a caller opts in by passing isAuthenticated.
  const showHeart = isAuthenticated !== undefined;

  return (
    <div className="group relative">
      <div className="relative overflow-hidden rounded-[14px] bg-surface ring-1 ring-line shadow-[var(--shadow-card)] transition-shadow duration-500 group-hover:shadow-[var(--shadow-lift)]">
        {listing.imageUrl ? (
          <Image
            src={listing.imageUrl}
            alt={listing.title}
            width={480}
            height={600}
            className={`aspect-[4/5] w-full object-cover transition-transform duration-700 ease-out ${
              unavailable ? "opacity-60" : "group-hover:scale-[1.045]"
            }`}
          />
        ) : (
          <div className={`grid aspect-[4/5] w-full place-items-center bg-blush/50 ${unavailable ? "opacity-60" : ""}`}>
            <span className="font-display text-3xl italic text-rose-soft">tk</span>
          </div>
        )}

        {listing.conditionName && !unavailable ? (
          <span className="absolute left-3 top-3 rounded-full bg-sage-soft/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sage backdrop-blur-sm">
            {listing.conditionName}
          </span>
        ) : null}

        {unavailable ? (
          <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-ink">
            <span className="rounded-full bg-paper/90 px-3 py-1.5 backdrop-blur-sm">No longer available</span>
          </span>
        ) : null}
      </div>

      {/* Stretched link — covers the whole card, sits beneath the heart. */}
      {!unavailable ? (
        <Link
          href={`/listings/${listing.id}`}
          aria-label={listing.title}
          className="absolute inset-0 z-10 rounded-[14px]"
        />
      ) : null}

      {/* Favourite heart — sibling of the link, above it. */}
      {showHeart ? (
        <div className="absolute right-3 top-3 z-20">
          <FavoriteButton
            key={listing.id}
            listingId={listing.id}
            initialFavorited={!!isFavorited}
            isAuthenticated={!!isAuthenticated}
          />
        </div>
      ) : null}

      <div className="mt-3 px-0.5">
        {listing.brandName ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
            {listing.brandName}
          </p>
        ) : null}
        <p className="mt-0.5 truncate text-[15px] leading-snug text-ink">{listing.title}</p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="font-display text-lg text-ink">${centsToDollars(listing.priceCents)}</span>
          {listing.sizeLabel ? <span className="text-xs text-ink-soft">{listing.sizeLabel}</span> : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the existing suite still navigates correctly**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: build succeeds (type-checks all `ListingCard` call sites). Existing callers pass only `listing`, so `showHeart` is false and the card is a plain stretched-link card — same destination as before.

- [ ] **Step 3: Commit**

```bash
git add src/components/listings/ListingCard.tsx
git commit -m "feat(B): stretched-link ListingCard with optional favourite heart"
```

---

### Task 5: Wire the heart into `/`, `/store/[slug]`, and `/listings/[id]`

**Files:**
- Modify: `src/app/(home)/page.tsx`
- Modify: `src/app/store/[slug]/page.tsx`
- Modify: `src/app/listings/[id]/page.tsx`

**Interfaces:**
- Consumes: `getOptionalUserId` (`src/lib/dal`), `getFavoritedListingIds` (`src/lib/favorites-data`), `FavoriteButton` (`src/components/listings/FavoriteButton`).

- [ ] **Step 1: Home grid — load auth + favourite set, pass to cards**

In `src/app/(home)/page.tsx`:

Add imports at the top:
```tsx
import { getOptionalUserId } from "@/lib/dal";
import { getFavoritedListingIds } from "@/lib/favorites-data";
```

After the existing `Promise.all([...])` that yields `listings, total, …`, add:
```tsx
  const userId = await getOptionalUserId();
  const favIds = userId
    ? await getFavoritedListingIds(userId, listings.map((l) => l.id))
    : new Set<string>();
```

Change the `<ListingCard listing={{…}} />` call to pass the two new props:
```tsx
                  <ListingCard
                    isAuthenticated={!!userId}
                    isFavorited={favIds.has(l.id)}
                    listing={{
                      id: l.id,
                      title: l.title,
                      priceCents: l.priceCents,
                      brandName: l.brand?.name ?? null,
                      sizeLabel: l.size?.label ?? null,
                      conditionName: l.condition?.name ?? null,
                      imageUrl: l.images[0]?.url ?? null,
                    }}
                  />
```

- [ ] **Step 2: Storefront grid — same wiring**

In `src/app/store/[slug]/page.tsx`, add the same two imports. After the storefront's listings are loaded (the array passed to `.map((l, i) => …)`), compute:
```tsx
  const userId = await getOptionalUserId();
  const favIds = userId
    ? await getFavoritedListingIds(userId, listings.map((l) => l.id))
    : new Set<string>();
```
(Use the actual local variable name the file uses for the listings array; if it is `storefront.listings`, map over that.) Then pass `isAuthenticated={!!userId}` and `isFavorited={favIds.has(l.id)}` to the `<ListingCard …>` exactly as in Step 1.

- [ ] **Step 3: Listing detail — inline heart near the price**

In `src/app/listings/[id]/page.tsx`:

Add the import:
```tsx
import { FavoriteButton } from "@/components/listings/FavoriteButton";
```

The file already computes `const viewerId = session?.user?.id ?? null;`. After the `if (!listing) notFound();` line and once `viewerId` is known, add:
```tsx
  const favorited = viewerId
    ? !!(await prisma.favorite.findUnique({
        where: { userId_listingId: { userId: viewerId, listingId: listing.id } },
        select: { id: true },
      }))
    : false;
```

Insert the inline heart right after the price `<p>` (the `${centsToDollars(listing.priceCents)}` paragraph), before the `{canAddToBag && (…)}` block:
```tsx
            <div className="mt-5">
              <FavoriteButton
                listingId={listing.id}
                initialFavorited={favorited}
                isAuthenticated={!!viewerId}
                variant="inline"
              />
            </div>
```

- [ ] **Step 4: Build + lint/typecheck**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: build succeeds, 16+ routes compiled, no type errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(home)/page.tsx" "src/app/store/[slug]/page.tsx" "src/app/listings/[id]/page.tsx"
git commit -m "feat(B): wire favourite heart into home, storefront, and detail"
```

---

### Task 6: `/favourites` page, loading skeleton, and header link

**Files:**
- Create: `src/app/favourites/page.tsx`
- Create: `src/app/favourites/loading.tsx`
- Modify: `src/components/site/SiteHeader.tsx`

**Interfaces:**
- Consumes: `verifySession` (`src/lib/dal`), `partitionFavorites` (`src/lib/favorites`), `ListingCard`, `SiteHeader`, `SkeletonHeader`/`SkeletonCard` (`src/components/skeletons/Skeletons`).

- [ ] **Step 1: Write the favourites page**

```tsx
// src/app/favourites/page.tsx
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { partitionFavorites } from "@/lib/favorites";
import { ListingCard } from "@/components/listings/ListingCard";
import { SiteHeader } from "@/components/site/SiteHeader";

export default async function FavouritesPage() {
  const { userId } = await verifySession();

  const favorites = await prisma.favorite.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      listing: {
        include: {
          images: { orderBy: { position: "asc" }, take: 1 },
          brand: { select: { name: true } },
          size: { select: { label: true } },
          condition: { select: { name: true } },
        },
      },
    },
  });

  const { available, unavailable } = partitionFavorites(favorites);

  const toCard = (f: (typeof favorites)[number]) => ({
    id: f.listing.id,
    title: f.listing.title,
    priceCents: f.listing.priceCents,
    brandName: f.listing.brand?.name ?? null,
    sizeLabel: f.listing.size?.label ?? null,
    conditionName: f.listing.condition?.name ?? null,
    imageUrl: f.listing.images[0]?.url ?? null,
  });

  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        <div className="mb-5 flex items-baseline justify-between border-b border-line pb-3 pt-10">
          <h1 className="font-display text-2xl text-ink">Favourites</h1>
          <span className="text-sm text-ink-soft">
            {favorites.length} {favorites.length === 1 ? "item" : "items"}
          </span>
        </div>

        {favorites.length === 0 ? (
          <div className="grid place-items-center rounded-[20px] border border-dashed border-line bg-surface/60 px-6 py-20 text-center">
            <p className="font-display text-2xl italic text-rose">No favourites yet.</p>
            <p className="mt-2 max-w-xs text-sm text-ink-soft">
              Tap the heart on anything you love and it will be saved here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
            {available.map((f) => (
              <ListingCard key={f.id} isAuthenticated isFavorited listing={toCard(f)} />
            ))}
            {unavailable.map((f) => (
              <ListingCard key={f.id} isAuthenticated isFavorited unavailable listing={toCard(f)} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 2: Write the loading skeleton**

```tsx
// src/app/favourites/loading.tsx
import { SkeletonHeader, SkeletonCard } from "@/components/skeletons/Skeletons";

export default function Loading() {
  return (
    <>
      <SkeletonHeader />
      <main className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        <div className="mb-5 h-10 border-b border-line" />
        <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </main>
    </>
  );
}
```

> If `SkeletonHeader`/`SkeletonCard` are not the exact exported names, open `src/components/skeletons/Skeletons.tsx` and use whatever it exports (the project created these in workstream C1).

- [ ] **Step 3: Add the Favourites link to the header**

In `src/components/site/SiteHeader.tsx`, add a nav link in the desktop `<nav>` (after the "Shop" link):
```tsx
          <Link href="/favourites" className="transition-colors hover:text-ink">
            Favourites
          </Link>
```

And add a heart icon link in the right-hand icon cluster, immediately before the `/bag` link:
```tsx
          <Link
            href="/favourites"
            aria-label="Favourites"
            className="grid h-11 w-11 place-items-center rounded-full text-ink-soft transition-colors hover:bg-blush hover:text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.18L12 21z" />
            </svg>
          </Link>
```

- [ ] **Step 4: Build + lint/typecheck**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: build succeeds; `/favourites` appears in the route list.

- [ ] **Step 5: Commit**

```bash
git add src/app/favourites/page.tsx src/app/favourites/loading.tsx src/components/site/SiteHeader.tsx
git commit -m "feat(B): /favourites page, skeleton, and header link"
```

---

### Task 7: End-to-end test + full green

**Files:**
- Create: `e2e/favorites.spec.ts`

**Interfaces:**
- Consumes: `createUser`, `createStorefront`, `createLiveListing` (`e2e/support/factories`), `signInAs` (`e2e/support/auth`), `expectZeroResidue` (`e2e/support/expect-cleanup`).

> Favourites cascade-delete with their user/listing, so the existing `expectZeroResidue` teardown covers residue with no new factory or cleanup code.

- [ ] **Step 1: Write the E2E spec**

```ts
// e2e/favorites.spec.ts
import { test, expect } from "@playwright/test";
import { createUser, createStorefront, createLiveListing } from "./support/factories";
import { signInAs } from "./support/auth";
import { expectZeroResidue } from "./support/expect-cleanup";

test.describe("Favourites", () => {
  // Factory seeding spawns a tsx subprocess per call — give each test headroom.
  test.setTimeout(60_000);

  test.afterAll(async () => {
    await expectZeroResidue("favorites");
  });

  test("buyer favourites an item, sees it on /favourites, then unfavourites", async ({ page }) => {
    const seller = await createUser({ emailTag: "fav-seller" });
    const store = await createStorefront(seller.id);
    const title = `Fav Test Onesie ${Date.now()}`;
    const listing = await createLiveListing(store.id, { title });
    const buyer = await createUser({ emailTag: "fav-buyer" });

    await signInAs(page, buyer);

    // Favourite from the deterministic detail page.
    await page.goto(`/listings/${listing.id}`);
    await page.getByRole("button", { name: /add to favourites/i }).click();
    await expect(page.getByRole("button", { name: /remove from favourites/i })).toBeVisible();

    // It shows on /favourites.
    await page.goto("/favourites");
    await expect(page.getByText(title)).toBeVisible();

    // Unfavourite → it leaves /favourites.
    await page.goto(`/listings/${listing.id}`);
    await page.getByRole("button", { name: /remove from favourites/i }).click();
    await expect(page.getByRole("button", { name: /add to favourites/i })).toBeVisible();
    await page.goto("/favourites");
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("anonymous heart click routes to /login", async ({ page, context }) => {
    const seller = await createUser({ emailTag: "fav-anon-seller" });
    const store = await createStorefront(seller.id);
    const listing = await createLiveListing(store.id, { title: `Anon Fav ${Date.now()}` });

    await context.clearCookies();
    await page.goto(`/listings/${listing.id}`);
    await page.getByRole("button", { name: /add to favourites/i }).click();
    await page.waitForURL("**/login");
    await expect(page).toHaveURL(/\/login/);
  });
});
```

- [ ] **Step 2: Run the new E2E spec**

Ensure port 3000 is free of `next dev` first (the harness builds and runs `next start` on 3000).
Run: `npm run test:e2e -- favorites`
Expected: 2 passed; teardown logs zero residue.

- [ ] **Step 3: Full green sweep**

Run: `npm run lint`
Run: `npm test` (expect the prior suite count + 3 new favourites unit tests)
Run: `npm run build`
Run: `npm run test:e2e` (full suite — confirms the `ListingCard` restructure did not regress public/buyer-offer/responsive/a11y specs)
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add e2e/favorites.spec.ts
git commit -m "test(B): favourites E2E (heart toggle, /favourites, anon→login)"
```

---

## Post-implementation

- [ ] Update `docs/superpowers/yaga-parity-roadmap.md`: set Section B row to `✅ Done` with date + merge commit, link this plan, and flip the two parity-matrix rows ("Favourites page", and the heart on cards/detail) to ✅.
- [ ] Human signed-in click-through (the gated `/favourites` render + heart toggle) is the final confirmation, consistent with how other gated pages in this project are signed off.

## Self-review notes (coverage map)
- Spec §1 optional session → Task 1 (`getOptionalUserId`). §2 lib → Task 1 (`partitionFavorites` tested; `getFavoritedListingIds` in `favorites-data.ts`). §3 action → Task 2. §4 island → Task 3. §5 card restructure (nested-interactive fix) → Task 4. §6 pages/header → Tasks 5–6. Testing (vitest/smoke/E2E) → Tasks 1, 2, 7. Decisions (anon→login, unavailable rendering, no counts) → Tasks 3, 4, 6. Naming (`/favourites`) → Tasks 6–7.
