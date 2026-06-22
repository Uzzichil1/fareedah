# Section C — Follow shops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Yaga-style shop following to TinyKloset — follow/unfollow a storefront, a public follower count, and a `/following` feed of recent LIVE listings from followed shops.

**Architecture:** A new `Follow` join model (migration). A pure `followingFeedWhere` helper (vitest) carries the LIVE-pin/empty-set invariant; data helpers + a `toggleFollow` action sit beside it; a `FollowButton` client island mirrors Section B's `FavoriteButton` (optimistic state + `router.refresh`). The feed page reuses the home grid (`ListingCard` + pagination) and Section B's favourite hearts.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), Prisma 7 (driver-adapter; migrations via `DIRECT_URL`), Auth.js v5, Tailwind v4, vitest, Playwright, `tsx` smoke scripts.

**Spec:** `docs/superpowers/specs/2026-06-20-section-c-follow-shops-design.md`

## Global Constraints

- **Migration guardrail (execution-critical):** the schema change runs against the live Supabase **dev** DB (holds demo + E2E fixtures). Confirm `DIRECT_URL` points at the dev project before migrating. The change is purely additive (one table + indexes). **If `prisma migrate dev` proposes or requires a DATABASE RESET (drift), STOP and escalate — never accept a reset.**
- **Visibility invariant:** the `/following` feed is pinned to `status:"LIVE"` via `followingFeedWhere`, and an empty follow-set must match NOTHING (never all listings). Public listing/storefront queries elsewhere are unchanged.
- **Decisions (locked):** `/following` = feed of recent items; follower count is public; Follow button on shop page AND listing detail; anon follow → `/login`; you cannot follow your own shop (button hidden when owner + server-side reject).
- **Pure logic in `src/lib/*` with vitest; a unit-tested lib file must NOT import `server-only` or `prisma`** (vitest loads it outside RSC). Data helpers live in `follows-data.ts` (no `server-only`, matching `db.ts`/`favorites-data.ts` so the `tsx` smoke can import them).
- **`followingFeedWhere` status is typed strictly** as the literal `"LIVE"` (not `string`), so a typo fails at tsc.
- **Route `/following`, copy "Following"; code/DB identifiers `Follow`/`follow`/`following`.**
- **Compound unique key** generated from `@@unique([followerId, storefrontId])` is `followerId_storefrontId`.
- **Verification honesty:** distinguish runtime-verified from code-verified/smoke-deferred. The signed-in human click-through is the final confirmation for gated pages.

---

### Task 1: `Follow` model + migration

**Files:**
- Modify: `prisma/schema.prisma` (add `Follow` model; add back-relations to `User` and `Storefront`)

**Interfaces:**
- Produces: a `follow` Prisma delegate with fields `id, followerId, storefrontId, createdAt`; unique `followerId_storefrontId`; relations `follower` (User) and `storefront` (Storefront), both `onDelete: Cascade`.

- [ ] **Step 1: Add the model + relations to the schema**

In `prisma/schema.prisma`, add the model (next to the other models):
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
Add the back-relation to `model User` (alongside `favorites Favorite[]`):
```prisma
  following Follow[]
```
Add the back-relation to `model Storefront` (alongside `bundles Bundle[]`):
```prisma
  followers Follow[]
```

- [ ] **Step 2: Confirm the migration target is DEV**

Run: `npx prisma migrate status`
Expected: it connects (via `DIRECT_URL`) and reports the dev DB state with no error. Confirm the host/project ref is the dev project before proceeding. If anything indicates a non-dev target, STOP.

- [ ] **Step 3: Create + apply the migration**

Run: `npx prisma migrate dev --name add_follow`
Expected: a new folder under `prisma/migrations/<timestamp>_add_follow/` with `migration.sql` creating the `Follow` table + indexes; output ends "Your database is now in sync with your schema." and runs `prisma generate`.
**If the command asks to reset the database / reports drift → STOP and escalate. Do NOT type `y` to a reset.**

- [ ] **Step 4: Regenerate the client + typecheck**

Run: `npx prisma generate`
Run: `npx tsc --noEmit`
Expected: client regenerates; tsc clean (no code consumes `Follow` yet, so types stay green).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(C): add Follow model + migration"
```

---

### Task 2: Follows lib — pure feed `where` + data helpers

**Files:**
- Create: `src/lib/follows.ts` (pure `followingFeedWhere`)
- Create: `src/lib/follows-data.ts` (server data helpers; no `server-only`)
- Test: `src/lib/follows.test.ts`

**Interfaces:**
- Consumes: the `follow` delegate from Task 1.
- Produces:
  - `followingFeedWhere(storefrontIds: string[]): { status: "LIVE"; storefrontId: { in: string[] } }`
  - `isFollowing(userId: string, storefrontId: string): Promise<boolean>`
  - `getFollowerCount(storefrontId: string): Promise<number>`
  - `getFollowedStorefrontIds(userId: string): Promise<string[]>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/follows.test.ts
import { describe, it, expect } from "vitest";
import { followingFeedWhere } from "./follows";

describe("followingFeedWhere", () => {
  it("is always LIVE-pinned", () => {
    expect(followingFeedWhere(["s1"]).status).toBe("LIVE");
    expect(followingFeedWhere([]).status).toBe("LIVE");
  });

  it("passes the storefront ids through unchanged", () => {
    expect(followingFeedWhere(["s1", "s2"])).toEqual({
      status: "LIVE",
      storefrontId: { in: ["s1", "s2"] },
    });
  });

  it("an empty follow set yields in:[] which matches nothing (never all listings)", () => {
    expect(followingFeedWhere([])).toEqual({ status: "LIVE", storefrontId: { in: [] } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- follows`
Expected: FAIL — `Cannot find module './follows'`.

- [ ] **Step 3: Write the pure helper**

```ts
// src/lib/follows.ts
/**
 * Prisma `where` for the "shops you follow" feed. ALWAYS LIVE-pinned. An empty
 * follow set yields `storefrontId: { in: [] }`, which matches NOTHING — the feed
 * must never fall back to showing all listings. Pure (no DB / no server-only).
 * `status` is the literal "LIVE" (not `string`) so a typo fails at tsc.
 */
export function followingFeedWhere(
  storefrontIds: string[],
): { status: "LIVE"; storefrontId: { in: string[] } } {
  return { status: "LIVE", storefrontId: { in: storefrontIds } };
}
```

- [ ] **Step 4: Write the server data helpers**

```ts
// src/lib/follows-data.ts
import { prisma } from "@/lib/db";

/** Whether `userId` follows `storefrontId`. */
export async function isFollowing(userId: string, storefrontId: string): Promise<boolean> {
  const row = await prisma.follow.findUnique({
    where: { followerId_storefrontId: { followerId: userId, storefrontId } },
    select: { id: true },
  });
  return !!row;
}

/** Public follower count for a storefront. */
export async function getFollowerCount(storefrontId: string): Promise<number> {
  return prisma.follow.count({ where: { storefrontId } });
}

/** Ids of the storefronts `userId` follows. */
export async function getFollowedStorefrontIds(userId: string): Promise<string[]> {
  const rows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { storefrontId: true },
  });
  return rows.map((r) => r.storefrontId);
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `npm test -- follows`
Expected: PASS (3 tests).
Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/follows.ts src/lib/follows-data.ts src/lib/follows.test.ts
git commit -m "feat(C): follows lib — followingFeedWhere + data helpers"
```

---

### Task 3: `toggleFollow` action + DB smoke

**Files:**
- Create: `src/app/following/actions.ts`
- Create: `scripts/smoke-follows.ts`

**Interfaces:**
- Consumes: `verifySession` (`@/lib/dal`), `followingFeedWhere` (`@/lib/follows`), `getFollowerCount`/`getFollowedStorefrontIds`/`isFollowing` (`@/lib/follows-data`).
- Produces: `toggleFollow(storefrontId: string): Promise<{ following: boolean } | { error: string }>` and the exported type `FollowResult`.

- [ ] **Step 1: Write the action**

```ts
// src/app/following/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";

export type FollowResult = { following: boolean } | { error: string };

/** Toggles the current user's follow of a storefront. Gated: cannot follow a
 *  non-existent shop or one's own shop. Idempotent under a unique race (P2002). */
export async function toggleFollow(storefrontId: string): Promise<FollowResult> {
  const { userId } = await verifySession();

  const existing = await prisma.follow.findUnique({
    where: { followerId_storefrontId: { followerId: userId, storefrontId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    revalidatePath("/following");
    return { following: false };
  }

  // Gate the create path: storefront must exist and not be the user's own.
  const storefront = await prisma.storefront.findUnique({
    where: { id: storefrontId },
    select: { userId: true },
  });
  if (!storefront) return { error: "This shop is no longer available." };
  if (storefront.userId === userId) return { error: "You can't follow your own shop." };

  try {
    await prisma.follow.create({ data: { followerId: userId, storefrontId } });
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code !== "P2002") throw e; // P2002 race → already following; fall through.
  }

  revalidatePath("/following");
  return { following: true };
}
```

- [ ] **Step 2: Write the smoke script**

```ts
// scripts/smoke-follows.ts
// Run with: npx tsx scripts/smoke-follows.ts
// Seeds a follower, a seller storefront, and two listings (LIVE + SOLD), then
// asserts the follow data invariants and the feed query, and cleans up.
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { followingFeedWhere } from "../src/lib/follows";
import { isFollowing, getFollowerCount, getFollowedStorefrontIds } from "../src/lib/follows-data";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("SMOKE FAIL: " + msg);
  console.log("ok - " + msg);
}

async function main() {
  const stamp = Date.now();
  const follower = await prisma.user.create({ data: { email: `smoke-follower-${stamp}@x.test` } });
  const sellerUser = await prisma.user.create({ data: { email: `smoke-fseller-${stamp}@x.test` } });
  const store = await prisma.storefront.create({
    data: { userId: sellerUser.id, name: `Follow ${stamp}`, slug: `smoke-follow-${stamp}` },
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
  const live = await mk("Follow LIVE", "LIVE");
  const sold = await mk("Follow SOLD", "SOLD");

  try {
    // follow → exists + count 1 + isFollowing true
    await prisma.follow.create({ data: { followerId: follower.id, storefrontId: store.id } });
    assert(await isFollowing(follower.id, store.id), "isFollowing true after follow");
    assert((await getFollowerCount(store.id)) === 1, "follower count is 1");
    assert((await getFollowedStorefrontIds(follower.id)).includes(store.id), "followed ids include the shop");

    // duplicate follow hits the unique constraint
    let dup = false;
    try { await prisma.follow.create({ data: { followerId: follower.id, storefrontId: store.id } }); }
    catch (e: unknown) { dup = (e as { code?: string }).code === "P2002"; }
    assert(dup, "duplicate follow hits the unique constraint (P2002)");

    // feed query returns the LIVE listing but not the SOLD one
    const ids = await getFollowedStorefrontIds(follower.id);
    const feed = await prisma.listing.findMany({ where: followingFeedWhere(ids), select: { id: true } });
    const feedIds = feed.map((l) => l.id);
    assert(feedIds.includes(live.id) && !feedIds.includes(sold.id), "feed returns LIVE only from followed shops");

    // empty follow set matches nothing
    const none = await prisma.listing.findMany({ where: followingFeedWhere([]), select: { id: true } });
    assert(none.length === 0, "empty follow set returns no listings");

    // unfollow → gone + count 0
    await prisma.follow.deleteMany({ where: { followerId: follower.id, storefrontId: store.id } });
    assert(!(await isFollowing(follower.id, store.id)), "isFollowing false after unfollow");
    assert((await getFollowerCount(store.id)) === 0, "follower count is 0 after unfollow");

    console.log("\nALL SMOKE CHECKS PASSED");
  } finally {
    await prisma.follow.deleteMany({ where: { followerId: follower.id } });
    await prisma.listing.deleteMany({ where: { storefrontId: store.id } });
    await prisma.storefront.deleteMany({ where: { slug: `smoke-follow-${stamp}` } });
    await prisma.user.deleteMany({ where: { id: { in: [follower.id, sellerUser.id] } } });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run the smoke + lint/typecheck**

Run: `npx tsx scripts/smoke-follows.ts`
Expected: `ok - …` lines then `ALL SMOKE CHECKS PASSED`, exit 0.
Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/following/actions.ts scripts/smoke-follows.ts
git commit -m "feat(C): toggleFollow action + follows smoke"
```

---

### Task 4: `FollowButton` client island

**Files:**
- Create: `src/components/store/FollowButton.tsx`

**Interfaces:**
- Consumes: `toggleFollow` (`@/app/following/actions`).
- Produces: `FollowButton({ storefrontId, initialFollowing, isAuthenticated }: { storefrontId: string; initialFollowing: boolean; isAuthenticated: boolean })`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/store/FollowButton.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleFollow } from "@/app/following/actions";

type Props = {
  storefrontId: string;
  initialFollowing: boolean;
  isAuthenticated: boolean;
};

export function FollowButton({ storefrontId, initialFollowing, isAuthenticated }: Props) {
  const router = useRouter();
  // Local optimistic state; NOT derived from the prop on re-render (component is
  // keyed by storefrontId). Reconciliation via router.refresh() after success.
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    const next = !following;
    setFollowing(next); // optimistic
    startTransition(async () => {
      const r = await toggleFollow(storefrontId);
      if ("error" in r) {
        setFollowing(!next); // revert
      } else {
        setFollowing(r.following);
        router.refresh(); // reconcile follower count + /following feed
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={following}
      aria-label={following ? "Unfollow this shop" : "Follow this shop"}
      className={
        following
          ? "inline-flex min-h-[44px] items-center rounded-full border border-line bg-surface px-5 py-2 text-sm font-semibold text-ink transition-colors hover:border-rose-soft disabled:opacity-60"
          : "inline-flex min-h-[44px] items-center rounded-full bg-rose px-5 py-2 text-sm font-semibold text-paper transition-colors hover:bg-rose-deep disabled:opacity-60"
      }
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors. (No isolated runtime test for the island — exercised by the E2E in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add src/components/store/FollowButton.tsx
git commit -m "feat(C): FollowButton client island"
```

---

### Task 5: Wire Follow into `/store/[slug]` and `/listings/[id]`

**Files:**
- Modify: `src/app/store/[slug]/page.tsx`
- Modify: `src/app/listings/[id]/page.tsx`

**Interfaces:**
- Consumes: `getFollowerCount`, `isFollowing` (`@/lib/follows-data`), `FollowButton` (`@/components/store/FollowButton`), existing `getOptionalUserId` (`@/lib/dal`).

- [ ] **Step 1: Storefront page — follower count + Follow button**

In `src/app/store/[slug]/page.tsx`:

Add imports:
```tsx
import { getFollowerCount, isFollowing } from "@/lib/follows-data";
import { FollowButton } from "@/components/store/FollowButton";
```

The file already computes `const userId = await getOptionalUserId();` after the storefront fetch. After that line add:
```tsx
  const followerCount = await getFollowerCount(storefront.id);
  const following = userId ? await isFollowing(userId, storefront.id) : false;
  const isOwnShop = userId === storefront.userId;
```

In the identity `<header>`, after the `{storefront.bio ? ... : null}` block (still inside `<header>`), add:
```tsx
          <div className="mt-4 flex flex-col items-center gap-3">
            <p className="text-sm text-ink-soft">
              {followerCount} {followerCount === 1 ? "follower" : "followers"}
            </p>
            {!isOwnShop ? (
              <FollowButton
                storefrontId={storefront.id}
                initialFollowing={following}
                isAuthenticated={!!userId}
              />
            ) : null}
          </div>
```

- [ ] **Step 2: Listing detail — Follow button by "Sold by"**

In `src/app/listings/[id]/page.tsx`:

Add imports:
```tsx
import { isFollowing } from "@/lib/follows-data";
import { FollowButton } from "@/components/store/FollowButton";
```

The file already computes `const viewerId = session?.user?.id ?? null;` and (from Section B) a `favorited` lookup. After the `favorited` computation add:
```tsx
  const isOwnShop = viewerId === listing.storefront.userId;
  const followingShop = viewerId ? await isFollowing(viewerId, listing.storefrontId) : false;
```

Replace the "Sold by" box body so the Follow button sits under the shop link:
```tsx
            <div className="mt-8 rounded-2xl border border-line bg-surface/70 p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-soft">Sold by</p>
              <Link
                href={`/store/${listing.storefront.slug}`}
                className="mt-1 inline-block font-display text-lg text-ink transition-colors hover:text-rose"
              >
                {listing.storefront.name}
              </Link>
              {!isOwnShop ? (
                <div className="mt-3">
                  <FollowButton
                    storefrontId={listing.storefrontId}
                    initialFollowing={followingShop}
                    isAuthenticated={!!viewerId}
                  />
                </div>
              ) : null}
            </div>
```

- [ ] **Step 3: Build + lint/typecheck**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: build succeeds (routes unchanged in count; both pages compile).

- [ ] **Step 4: Commit**

```bash
git add "src/app/store/[slug]/page.tsx" "src/app/listings/[id]/page.tsx"
git commit -m "feat(C): wire Follow button + follower count into shop + detail"
```

---

### Task 6: `/following` feed page, skeleton, and header link

**Files:**
- Create: `src/app/following/page.tsx`
- Create: `src/app/following/loading.tsx`
- Modify: `src/components/site/SiteHeader.tsx`

**Interfaces:**
- Consumes: `verifySession` (`@/lib/dal`), `getFollowedStorefrontIds` (`@/lib/follows-data`), `followingFeedWhere` (`@/lib/follows`), `getFavoritedListingIds` (`@/lib/favorites-data`), `PAGE_SIZE` (`@/lib/listing-query`), `ListingCard`, `SiteHeader`, `SkeletonHeader`/`SkeletonCard` (`@/components/skeletons/Skeletons`).

- [ ] **Step 1: Write the feed page**

```tsx
// src/app/following/page.tsx
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { getFollowedStorefrontIds } from "@/lib/follows-data";
import { followingFeedWhere } from "@/lib/follows";
import { getFavoritedListingIds } from "@/lib/favorites-data";
import { PAGE_SIZE } from "@/lib/listing-query";
import { ListingCard } from "@/components/listings/ListingCard";
import { SiteHeader } from "@/components/site/SiteHeader";

type SP = Record<string, string | string[] | undefined>;

function pageHref(page: number): string {
  return `/following?page=${page}`;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid place-items-center rounded-[20px] border border-dashed border-line bg-surface/60 px-6 py-20 text-center">
      <p className="font-display text-2xl italic text-rose">{title}</p>
      <p className="mt-2 max-w-xs text-sm text-ink-soft">{body}</p>
    </div>
  );
}

export default async function FollowingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { userId } = await verifySession();
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);

  const followedIds = await getFollowedStorefrontIds(userId);

  let listings: Awaited<ReturnType<typeof loadFeed>>["listings"] = [];
  let total = 0;
  if (followedIds.length > 0) {
    const feed = await loadFeed(followedIds, page);
    listings = feed.listings;
    total = feed.total;
  }
  const favIds =
    listings.length > 0 ? await getFavoritedListingIds(userId, listings.map((l) => l.id)) : new Set<string>();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        <div className="mb-5 flex items-baseline justify-between border-b border-line pb-3 pt-10">
          <h1 className="font-display text-2xl text-ink">Following</h1>
          <span className="text-sm text-ink-soft">
            {total} {total === 1 ? "piece" : "pieces"}
          </span>
        </div>

        {followedIds.length === 0 ? (
          <EmptyState
            title="You're not following any shops yet."
            body="Follow a shop to see their new arrivals here."
          />
        ) : total === 0 ? (
          <EmptyState
            title="Nothing new just yet."
            body="The shops you follow have no items for sale right now."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
              {listings.map((l, i) => (
                <div key={l.id} className="rise-in" style={{ animationDelay: `${Math.min(i, 10) * 55}ms` }}>
                  <ListingCard
                    isAuthenticated
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
                </div>
              ))}
            </div>
            {totalPages > 1 ? (
              <nav className="mt-14 flex items-center justify-between border-t border-line pt-6 text-sm">
                {page > 1 ? (
                  <a className="rounded-full border border-line bg-surface px-5 py-2 text-ink shadow-[var(--shadow-card)] transition-colors hover:border-rose-soft hover:text-rose" href={pageHref(page - 1)}>
                    ← Previous
                  </a>
                ) : (
                  <span />
                )}
                <span className="text-ink-soft">
                  Page <span className="font-display text-ink">{page}</span> of{" "}
                  <span className="font-display text-ink">{totalPages}</span>
                </span>
                {page < totalPages ? (
                  <a className="rounded-full border border-line bg-surface px-5 py-2 text-ink shadow-[var(--shadow-card)] transition-colors hover:border-rose-soft hover:text-rose" href={pageHref(page + 1)}>
                    Next →
                  </a>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}

async function loadFeed(followedIds: string[], page: number) {
  const where = followingFeedWhere(followedIds);
  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        brand: { select: { name: true } },
        size: { select: { label: true } },
        condition: { select: { name: true } },
      },
    }),
    prisma.listing.count({ where }),
  ]);
  return { listings, total };
}
```

- [ ] **Step 2: Write the loading skeleton**

```tsx
// src/app/following/loading.tsx
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

- [ ] **Step 3: Add the Following link to the header**

In `src/components/site/SiteHeader.tsx`, add a nav link in the desktop `<nav>` after the "Favourites" link (added in Section B):
```tsx
          <Link href="/following" className="transition-colors hover:text-ink">
            Following
          </Link>
```

- [ ] **Step 4: Build + lint/typecheck**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: build succeeds; `/following` appears in the route list.

- [ ] **Step 5: Commit**

```bash
git add src/app/following/page.tsx src/app/following/loading.tsx src/components/site/SiteHeader.tsx
git commit -m "feat(C): /following feed page, skeleton, and header link"
```

---

### Task 7: End-to-end test + full green

**Files:**
- Create: `e2e/follows.spec.ts`

**Interfaces:**
- Consumes: `createUser`, `createStorefront`, `createLiveListing` (`e2e/support/factories`), `signInAs` (`e2e/support/auth`), `expectZeroResidue` (`e2e/support/expect-cleanup`).

> Follows cascade-delete with their user/storefront, so the existing `expectZeroResidue` teardown covers residue with no new factory/cleanup code.

- [ ] **Step 1: Write the E2E spec**

```ts
// e2e/follows.spec.ts
import { test, expect } from "@playwright/test";
import { createUser, createStorefront, createLiveListing } from "./support/factories";
import { signInAs } from "./support/auth";
import { expectZeroResidue } from "./support/expect-cleanup";

test.describe("Follow shops", () => {
  // Factory seeding spawns a tsx subprocess per call — give each test headroom.
  test.setTimeout(60_000);

  test.afterAll(async () => {
    await expectZeroResidue("follows");
  });

  test("buyer follows a shop, sees its item on /following, then unfollows", async ({ page }) => {
    const seller = await createUser({ emailTag: "fol-seller" });
    const store = await createStorefront(seller.id);
    const title = `Follow Test Romper ${Date.now()}`;
    await createLiveListing(store.id, { title });
    const buyer = await createUser({ emailTag: "fol-buyer" });

    await signInAs(page, buyer);

    // Follow from the shop page.
    await page.goto(`/store/${store.slug}`);
    const followBtn = page.getByRole("button", { name: /follow this shop/i });
    await expect(followBtn).toBeVisible();
    await followBtn.click();

    // Wait for the button to settle BEFORE asserting the count (the count lives
    // in the server component and updates only after the write + router.refresh).
    const unfollowBtn = page.getByRole("button", { name: /unfollow this shop/i });
    await expect(unfollowBtn).toBeVisible();
    await expect(unfollowBtn).toBeEnabled();
    await expect(page.getByText(/1 follower/)).toBeVisible();

    // Item shows on /following.
    await page.goto("/following");
    await expect(page.getByText(title)).toBeVisible();

    // Unfollow from the shop page.
    await page.goto(`/store/${store.slug}`);
    await page.getByRole("button", { name: /unfollow this shop/i }).click();
    await expect(page.getByRole("button", { name: /follow this shop/i })).toBeVisible();
  });

  test("anonymous follow click routes to /login", async ({ page, context }) => {
    const seller = await createUser({ emailTag: "fol-anon-seller" });
    const store = await createStorefront(seller.id);
    await createLiveListing(store.id, { title: `Anon Follow ${Date.now()}` });

    await context.clearCookies();
    await page.goto(`/store/${store.slug}`);
    await page.getByRole("button", { name: /follow this shop/i }).click();
    await page.waitForURL("**/login");
    await expect(page).toHaveURL(/\/login/);
  });

  test("owner does not see a Follow button on their own shop", async ({ page }) => {
    const seller = await createUser({ emailTag: "fol-owner" });
    const store = await createStorefront(seller.id);
    await createLiveListing(store.id, { title: `Owner Shop ${Date.now()}` });

    await signInAs(page, seller);
    await page.goto(`/store/${store.slug}`);
    await expect(page.getByText(/0 followers/)).toBeVisible(); // page rendered
    await expect(page.getByRole("button", { name: /follow this shop/i })).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run the new E2E spec**

Ensure port 3000 is free of `next dev` first (the harness builds and runs `next start` on 3000).
Run: `npm run test:e2e -- follows`
Expected: 3 passed; teardown logs zero residue. If a test fails, use systematic debugging — read the trace, find the root cause; do not weaken assertions.

- [ ] **Step 3: Full green sweep**

Run: `npm run lint`
Run: `npm test` (prior suite + the 3 new `followingFeedWhere` tests)
Run: `npm run build`
Run: `npm run test:e2e` (full suite — confirms the shop/detail edits didn't regress public/buyer-offer/favorites/responsive/a11y specs)
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add e2e/follows.spec.ts
git commit -m "test(C): follow-shops E2E (follow, /following feed, anon→login, own-shop hidden)"
```

---

## Post-implementation

- [ ] Update `docs/superpowers/yaga-parity-roadmap.md`: set Section C row to `✅ Done` with date + merge commit, link this plan, and flip the "Following / followed-shops feed" parity-matrix row to ✅.
- [ ] Human signed-in click-through (follow → `/following` feed → unfollow; follower count increments) is the final confirmation.

## Self-review notes (coverage map)
- Spec data model + migration → Task 1 (with reset guardrail). §1 pure helper → Task 2 (`followingFeedWhere` tested, strict `"LIVE"` literal). §2 data helpers → Task 2. §3 action (gated create, P2002) → Task 3. §4 island → Task 4. §5 shop + detail wiring (count, button, own-shop hidden) → Task 5. `/following` feed + skeleton + header → Task 6. Testing (vitest/smoke/E2E incl. count-race settle) → Tasks 2, 3, 7. Decisions (feed of items, public count, both surfaces, anon→login, no self-follow) → Tasks 4–7.
