# Phase 4a — Cart & Bundles with Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in buyer collect a seller's LIVE items into a per-seller bundle (cart), send the seller an offer, and let the seller accept/decline — all pre-payment.

**Architecture:** The existing `Bundle`/`BundleItem` models become the per-seller cart *and* the offer vehicle (Approach A). One schema change adds `offerCents` to `Bundle`. All state transitions use the codebase's atomic, ownership-scoped `updateMany({ where: { id, <owner>, status: <from> }, data: {...} })` idiom (the same pattern as `admin/actions.ts`), which guards ownership + from-state + concurrency in a single query. Pure logic (transition guards, offer-bound validation, live total) lives in a unit-tested `src/lib/bundle.ts`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma 7 (`prisma-client` generator → `src/generated/prisma`), Postgres on Supabase, Vitest, Tailwind v4 + the boutique design system (`components/ui/*`).

**Spec:** `docs/superpowers/specs/2026-06-06-phase-4a-cart-bundles-design.md`

**Conventions (read first):**
- This is a deliberately-modified Next.js — `params`/`searchParams` are Promises (await them); middleware is `src/proxy.ts`. Check `node_modules/next/dist/docs/` before any Next-specific code.
- Prisma client is imported as `import { prisma } from "@/lib/db"`.
- Server actions return `{ error: string } | undefined` (see `src/app/sell/actions.ts`).
- Migrations apply to live Supabase via `DIRECT_URL` (`prisma.config.ts`). Confirm the target before running.
- Run everything from `C:\Users\27795\Desktop\Fareedah` (not a worktree subfolder unless one was created for this work).

---

## File structure

**Create:**
- `src/lib/bundle.ts` — pure helpers: `canTransition`, `nextStatus`, `listedTotalCents`, `offerError`.
- `src/lib/bundle.test.ts` — unit tests for the above.
- `src/app/bag/actions.ts` — buyer actions: `addToBundle`, `removeFromBundle`, `clearBundle`, `submitOffer`, `withdrawOffer`.
- `src/app/bag/page.tsx` — buyer bag page (bundles grouped by seller).
- `src/app/sell/offers/actions.ts` — seller action: `respondToOffer`.
- `src/app/sell/offers/page.tsx` — seller incoming-offers page.
- `src/components/bag/AddToBagButton.tsx` — client; posts `addToBundle`.
- `src/components/bag/BagControls.tsx` — client; per-bundle remove/offer/withdraw/clear controls.
- `src/components/sell/OfferActions.tsx` — client; accept/decline (mirrors `CurationActions`).
- `scripts/smoke-bundle.ts` — DB-level integration smoke for the guard idioms (no auth context needed).

**Modify:**
- `prisma/schema.prisma` — add `offerCents Int?` to `Bundle`.
- `src/components/site/SiteHeader.tsx` — add a bag link + item count.
- `src/app/listings/[id]/page.tsx` — add `<AddToBagButton>` (buyer, non-own listings).

---

## Task 1: Schema — add `offerCents` + one-OPEN-bundle partial unique index

**Files:**
- Modify: `prisma/schema.prisma` (the `Bundle` model)
- Create: a migration under `prisma/migrations/<timestamp>_bundle_offer_cents/migration.sql`

- [ ] **Step 1: Add the field to the `Bundle` model**

In `prisma/schema.prisma`, add `offerCents` to `Bundle` (place it after `status`):

```prisma
model Bundle {
  id           String       @id @default(cuid())
  buyerId      String
  storefrontId String
  status       BundleStatus @default(OPEN)
  offerCents   Int?         // null = no offer (buy-now). Proposed total on SUBMITTED; agreed total on ACCEPTED.
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  buyer      User         @relation(fields: [buyerId], references: [id])
  storefront Storefront   @relation(fields: [storefrontId], references: [id])
  items      BundleItem[]

  @@index([buyerId])
  @@index([storefrontId])
}
```

- [ ] **Step 2: Generate the migration without applying it**

Run: `npx prisma migrate dev --name bundle_offer_cents --create-only`
Expected: a new folder `prisma/migrations/<timestamp>_bundle_offer_cents/` containing `migration.sql` with an `ALTER TABLE "Bundle" ADD COLUMN "offerCents" INTEGER;`

- [ ] **Step 3: Append the partial unique index to the migration SQL**

Edit the generated `migration.sql` and add this line at the end (Prisma cannot express a partial index, so it is hand-written; it enforces "at most one OPEN bundle per buyer+seller" while letting DECLINED/CHECKED_OUT rows coexist):

```sql
-- At most one OPEN bundle per (buyer, seller); makes find-or-create race-safe.
CREATE UNIQUE INDEX "Bundle_buyer_seller_open_key"
  ON "Bundle" ("buyerId", "storefrontId")
  WHERE status = 'OPEN';
```

- [ ] **Step 4: Apply the migration to Supabase and regenerate the client**

Run: `npx prisma migrate dev`
Expected: "Already in sync" is NOT shown; instead the pending migration applies cleanly, then "✔ Generated Prisma Client". `offerCents` now exists on the generated `Bundle` type.

- [ ] **Step 5: Verify the column and index exist**

Run: `npx prisma migrate status`
Expected: "Database schema is up to date!" with the `bundle_offer_cents` migration listed as applied.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(4a): add Bundle.offerCents + one-OPEN-bundle partial unique index"
```

---

## Task 2: Pure bundle logic + unit tests (TDD)

**Files:**
- Create: `src/lib/bundle.ts`
- Test: `src/lib/bundle.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/bundle.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canTransition, nextStatus, listedTotalCents, offerError } from "./bundle";

describe("canTransition / nextStatus", () => {
  it("allows item edits only from OPEN or DECLINED, landing on OPEN", () => {
    expect(canTransition("OPEN", "addItem")).toBe(true);
    expect(canTransition("DECLINED", "addItem")).toBe(true);
    expect(canTransition("SUBMITTED", "addItem")).toBe(false);
    expect(canTransition("ACCEPTED", "removeItem")).toBe(false);
    expect(nextStatus("addItem")).toBe("OPEN");
  });
  it("allows submitOffer from OPEN/DECLINED → SUBMITTED", () => {
    expect(canTransition("OPEN", "submitOffer")).toBe(true);
    expect(canTransition("DECLINED", "submitOffer")).toBe(true);
    expect(canTransition("SUBMITTED", "submitOffer")).toBe(false);
    expect(nextStatus("submitOffer")).toBe("SUBMITTED");
  });
  it("allows withdraw only from SUBMITTED → OPEN", () => {
    expect(canTransition("SUBMITTED", "withdrawOffer")).toBe(true);
    expect(canTransition("OPEN", "withdrawOffer")).toBe(false);
    expect(nextStatus("withdrawOffer")).toBe("OPEN");
  });
  it("allows seller accept/decline only from SUBMITTED", () => {
    expect(canTransition("SUBMITTED", "accept")).toBe(true);
    expect(canTransition("SUBMITTED", "decline")).toBe(true);
    expect(canTransition("ACCEPTED", "accept")).toBe(false);
    expect(nextStatus("accept")).toBe("ACCEPTED");
    expect(nextStatus("decline")).toBe("DECLINED");
  });
});

describe("listedTotalCents", () => {
  it("sums only LIVE items", () => {
    expect(
      listedTotalCents([
        { priceCents: 3400, isLive: true },
        { priceCents: 2800, isLive: true },
        { priceCents: 9900, isLive: false },
      ]),
    ).toBe(6200);
  });
  it("is 0 for no live items", () => {
    expect(listedTotalCents([{ priceCents: 5000, isLive: false }])).toBe(0);
    expect(listedTotalCents([])).toBe(0);
  });
});

describe("offerError", () => {
  it("rejects non-positive or non-integer offers", () => {
    expect(offerError(0, 6200)).not.toBeNull();
    expect(offerError(-5, 6200)).not.toBeNull();
    expect(offerError(12.5, 6200)).not.toBeNull();
  });
  it("rejects offers above the listed total", () => {
    expect(offerError(6300, 6200)).not.toBeNull();
  });
  it("rejects when nothing is available", () => {
    expect(offerError(100, 0)).not.toBeNull();
  });
  it("accepts a valid offer up to and including the listed total", () => {
    expect(offerError(5000, 6200)).toBeNull();
    expect(offerError(6200, 6200)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/bundle.test.ts`
Expected: FAIL — "Failed to resolve import './bundle'" / functions not defined.

- [ ] **Step 3: Implement `src/lib/bundle.ts`**

```ts
// Pure bundle logic — no DB, no I/O. Unit-tested in bundle.test.ts.

export type BundleStatus =
  | "OPEN"
  | "SUBMITTED"
  | "ACCEPTED"
  | "DECLINED"
  | "CHECKED_OUT";

export type BundleAction =
  | "addItem"
  | "removeItem"
  | "submitOffer"
  | "withdrawOffer"
  | "accept"
  | "decline";

const TRANSITIONS: Record<BundleAction, { from: BundleStatus[]; to: BundleStatus }> = {
  addItem: { from: ["OPEN", "DECLINED"], to: "OPEN" },
  removeItem: { from: ["OPEN", "DECLINED"], to: "OPEN" },
  submitOffer: { from: ["OPEN", "DECLINED"], to: "SUBMITTED" },
  withdrawOffer: { from: ["SUBMITTED"], to: "OPEN" },
  accept: { from: ["SUBMITTED"], to: "ACCEPTED" },
  decline: { from: ["SUBMITTED"], to: "DECLINED" },
};

/** The set of from-statuses each action is allowed from (the buy-now/checkout
 *  transition to CHECKED_OUT belongs to 4c and is intentionally absent). */
export function canTransition(from: BundleStatus, action: BundleAction): boolean {
  return TRANSITIONS[action].from.includes(from);
}

export function nextStatus(action: BundleAction): BundleStatus {
  return TRANSITIONS[action].to;
}

/** Live listed total in cents — non-LIVE items are excluded (they're unavailable). */
export function listedTotalCents(items: { priceCents: number; isLive: boolean }[]): number {
  return items.reduce((sum, i) => (i.isLive ? sum + i.priceCents : sum), 0);
}

/** Validate a proposed offer (cents) against the live listed total.
 *  Returns a user-facing message, or null when the offer is acceptable. */
export function offerError(offerCents: number, listedTotalCents: number): string | null {
  if (!Number.isInteger(offerCents) || offerCents <= 0) {
    return "Enter an offer above $0.";
  }
  if (listedTotalCents <= 0) {
    return "This bundle has no available items.";
  }
  if (offerCents > listedTotalCents) {
    return "Your offer can't be more than the listed total.";
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/bundle.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bundle.ts src/lib/bundle.test.ts
git commit -m "feat(4a): pure bundle logic (transitions, live total, offer bounds) + tests"
```

---

## Task 3: Buyer bag actions

**Files:**
- Create: `src/app/bag/actions.ts`

Uses the atomic, ownership-scoped `updateMany` guard for every state change, the `findOrCreate` race made safe by Task 1's partial unique index, and `dollarsToCents` + `offerError` for offer validation.

- [ ] **Step 1: Implement the actions**

Create `src/app/bag/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { dollarsToCents } from "@/lib/money";
import { listedTotalCents, offerError } from "@/lib/bundle";

export type ActionResult = { error: string } | undefined;

const EDITABLE = ["OPEN", "DECLINED"] as const;

/** Add a LIVE listing to the buyer's OPEN bundle for that seller (find-or-create). */
export async function addToBundle(listingId: string): Promise<ActionResult> {
  const { userId } = await verifySession();

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      status: true,
      storefrontId: true,
      storefront: { select: { userId: true } },
    },
  });
  if (!listing || listing.status !== "LIVE") {
    return { error: "This item is no longer available." };
  }
  if (listing.storefront.userId === userId) {
    return { error: "You can't add your own item." };
  }

  // Find-or-create the OPEN bundle. The partial unique index (Task 1) makes the
  // race safe: a losing concurrent create throws, and we re-read the winner.
  let bundle = await prisma.bundle.findFirst({
    where: { buyerId: userId, storefrontId: listing.storefrontId, status: "OPEN" },
    select: { id: true },
  });
  if (!bundle) {
    try {
      bundle = await prisma.bundle.create({
        data: { buyerId: userId, storefrontId: listing.storefrontId, status: "OPEN" },
        select: { id: true },
      });
    } catch {
      bundle = await prisma.bundle.findFirstOrThrow({
        where: { buyerId: userId, storefrontId: listing.storefrontId, status: "OPEN" },
        select: { id: true },
      });
    }
  }

  // skipDuplicates makes a re-add (double-click) a no-op instead of a P2002 500.
  await prisma.bundleItem.createMany({
    data: [{ bundleId: bundle.id, listingId }],
    skipDuplicates: true,
  });

  revalidatePath("/bag");
  return undefined;
}

/** Remove one item from an editable bundle; delete the bundle if it becomes empty. */
export async function removeFromBundle(bundleId: string, listingId: string): Promise<ActionResult> {
  const { userId } = await verifySession();

  const bundle = await prisma.bundle.findFirst({
    where: { id: bundleId, buyerId: userId, status: { in: [...EDITABLE] } },
    select: { id: true },
  });
  if (!bundle) return { error: "This bag can't be edited." };

  await prisma.bundleItem.deleteMany({ where: { bundleId, listingId } });

  const remaining = await prisma.bundleItem.count({ where: { bundleId } });
  if (remaining === 0) {
    await prisma.bundle.delete({ where: { id: bundleId } });
  } else {
    await prisma.bundle.update({
      where: { id: bundleId },
      data: { status: "OPEN", offerCents: null },
    });
  }

  revalidatePath("/bag");
  return undefined;
}

/** Delete an editable bundle entirely. */
export async function clearBundle(bundleId: string): Promise<ActionResult> {
  const { userId } = await verifySession();
  const { count } = await prisma.bundle.deleteMany({
    where: { id: bundleId, buyerId: userId, status: { in: [...EDITABLE] } },
  });
  if (count === 0) return { error: "This bag can't be cleared." };
  revalidatePath("/bag");
  return undefined;
}

/** Submit a proposed total (dollars) on an editable bundle → SUBMITTED. */
export async function submitOffer(bundleId: string, offerDollars: string): Promise<ActionResult> {
  const { userId } = await verifySession();

  const offerCents = dollarsToCents(offerDollars);
  if (offerCents === null) return { error: "Enter a valid amount." };

  const bundle = await prisma.bundle.findFirst({
    where: { id: bundleId, buyerId: userId, status: { in: [...EDITABLE] } },
    select: {
      items: { select: { listing: { select: { priceCents: true, status: true } } } },
    },
  });
  if (!bundle) return { error: "This bag can't receive an offer." };

  const listed = listedTotalCents(
    bundle.items.map((i) => ({ priceCents: i.listing.priceCents, isLive: i.listing.status === "LIVE" })),
  );
  const err = offerError(offerCents, listed);
  if (err) return { error: err };

  // Atomic guard: only transitions if still owned + still editable.
  const { count } = await prisma.bundle.updateMany({
    where: { id: bundleId, buyerId: userId, status: { in: [...EDITABLE] } },
    data: { status: "SUBMITTED", offerCents },
  });
  if (count === 0) return { error: "This bag can't receive an offer." };

  revalidatePath("/bag");
  return undefined;
}

/** Withdraw a pending offer → OPEN. */
export async function withdrawOffer(bundleId: string): Promise<ActionResult> {
  const { userId } = await verifySession();
  const { count } = await prisma.bundle.updateMany({
    where: { id: bundleId, buyerId: userId, status: "SUBMITTED" },
    data: { status: "OPEN", offerCents: null },
  });
  if (count === 0) return { error: "No pending offer to withdraw." };
  revalidatePath("/bag");
  return undefined;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors (the file compiles against the regenerated Prisma types from Task 1).

- [ ] **Step 3: Commit**

```bash
git add src/app/bag/actions.ts
git commit -m "feat(4a): buyer bag actions (add/remove/clear/offer/withdraw)"
```

---

## Task 4: Seller respond-to-offer action

**Files:**
- Create: `src/app/sell/offers/actions.ts`

- [ ] **Step 1: Implement the action**

Create `src/app/sell/offers/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSeller } from "@/lib/dal";

export type ActionResult = { error: string } | undefined;

/** Seller accepts or declines a pending offer on their own storefront's bundle. */
export async function respondToOffer(bundleId: string, accept: boolean): Promise<ActionResult> {
  const { storefrontId } = await requireSeller();
  const { count } = await prisma.bundle.updateMany({
    where: { id: bundleId, storefrontId, status: "SUBMITTED" },
    data: { status: accept ? "ACCEPTED" : "DECLINED" },
  });
  if (count === 0) return { error: "This offer is no longer pending." };
  revalidatePath("/sell/offers");
  return undefined;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/sell/offers/actions.ts
git commit -m "feat(4a): seller respondToOffer action (accept/decline)"
```

---

## Task 5: Add-to-bag button on listing detail

**Files:**
- Create: `src/components/bag/AddToBagButton.tsx`
- Modify: `src/app/listings/[id]/page.tsx`

- [ ] **Step 1: Create the client button**

Create `src/components/bag/AddToBagButton.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToBundle } from "@/app/bag/actions";
import { Button } from "@/components/ui/Button";

export function AddToBagButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const r = await addToBundle(listingId);
      if (r?.error) {
        setError(r.error);
      } else {
        setAdded(true);
        router.push("/bag");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={add} disabled={pending || added}>
        {added ? "Added to bag" : pending ? "Adding…" : "Add to bag"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the listing detail page (buyer, non-own listings only)**

In `src/app/listings/[id]/page.tsx`, add these imports at the top:

```tsx
import { auth } from "@/auth";
import { AddToBagButton } from "@/components/bag/AddToBagButton";
```

The page already loads `listing` with `storefront: { select: { name: true, slug: true } }`. Extend that select to include the owner id so we can hide the button on the buyer's own item — change the storefront select to:

```tsx
      storefront: { select: { name: true, slug: true, userId: true } },
```

The page is an async Server Component. Compute the visibility flag **at the top of the component**, right after the existing `const [hero, ...rest] = listing.images;` line (do not `await` inside JSX — that doesn't render in an RSC):

```tsx
  const session = await auth();
  const viewerId = session?.user?.id ?? null;
  // Buyers (signed in) who don't own this listing can add it to a bag.
  const canAddToBag = !!viewerId && viewerId !== listing.storefront.userId;
```

Then, just after the `<p className="mt-3 font-display text-2xl text-rose">…price…</p>` block, insert:

```tsx
            {canAddToBag && (
              <div className="mt-5">
                <AddToBagButton listingId={listing.id} />
              </div>
            )}
```

(`auth` is the export from `src/auth.ts` used across the app.)

- [ ] **Step 3: Build to verify it compiles and renders**

Run: `npm run build`
Expected: "Compiled successfully", TypeScript passes, `/listings/[id]` builds.

- [ ] **Step 4: Commit**

```bash
git add src/components/bag/AddToBagButton.tsx "src/app/listings/[id]/page.tsx"
git commit -m "feat(4a): add-to-bag button on listing detail (buyer, non-own)"
```

---

## Task 6: Buyer bag page + controls

**Files:**
- Create: `src/components/bag/BagControls.tsx`
- Create: `src/app/bag/page.tsx`

- [ ] **Step 1: Create the per-bundle client controls**

Create `src/components/bag/BagControls.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeFromBundle,
  clearBundle,
  submitOffer,
  withdrawOffer,
} from "@/app/bag/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/inputs";

type Item = { listingId: string; title: string };

export function BagControls({
  bundleId,
  status,
  items,
}: {
  bundleId: string;
  status: "OPEN" | "SUBMITTED" | "ACCEPTED" | "DECLINED" | "CHECKED_OUT";
  items: Item[];
}) {
  const router = useRouter();
  const [offer, setOffer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error: string } | undefined>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  }

  const editable = status === "OPEN" || status === "DECLINED";

  return (
    <div className="mt-3 flex flex-col gap-3">
      {editable && (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <Button
              key={it.listingId}
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(() => removeFromBundle(bundleId, it.listingId))}
            >
              Remove {it.title}
            </Button>
          ))}
        </div>
      )}

      {editable && (
        <div className="flex items-center gap-2">
          <Input
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            placeholder="Offer (USD)"
            inputMode="decimal"
            className="max-w-[10rem]"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => run(() => submitOffer(bundleId, offer))}
          >
            Send offer
          </Button>
        </div>
      )}

      {status === "SUBMITTED" && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => withdrawOffer(bundleId))}
        >
          Withdraw offer
        </Button>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          disabled
          title="Checkout arrives in Phase 4c"
        >
          Checkout (coming soon)
        </Button>
        {editable && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => clearBundle(bundleId))}
          >
            Clear bag
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create the bag page**

Create `src/app/bag/page.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { centsToDollars } from "@/lib/money";
import { listedTotalCents } from "@/lib/bundle";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Badge } from "@/components/ui/Badge";
import { BagControls } from "@/components/bag/BagControls";

export const metadata = { title: "Your bag" };

const OFFER_BADGE: Record<string, { tone: "neutral" | "sage" | "rose" | "danger"; label: string }> = {
  OPEN: { tone: "neutral", label: "In bag" },
  SUBMITTED: { tone: "rose", label: "Offer sent" },
  ACCEPTED: { tone: "sage", label: "Offer accepted" },
  DECLINED: { tone: "danger", label: "Offer declined" },
};

export default async function BagPage() {
  const { userId } = await verifySession();

  const bundles = await prisma.bundle.findMany({
    where: { buyerId: userId, status: { in: ["OPEN", "SUBMITTED", "ACCEPTED", "DECLINED"] } },
    orderBy: { updatedAt: "desc" },
    include: {
      storefront: { select: { name: true, slug: true } },
      items: {
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              priceCents: true,
              status: true,
              images: { orderBy: { position: "asc" }, take: 1 },
            },
          },
        },
      },
    },
  });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <h1 className="mb-8 font-display text-3xl text-ink">Your bag</h1>

        {bundles.length === 0 ? (
          <div className="grid place-items-center rounded-[20px] border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
            <p className="font-display text-xl italic text-rose">Your bag is empty.</p>
            <p className="mt-2 text-sm text-ink-soft">
              Browse the closet and add pieces you love.
            </p>
            <Link href="/" className="mt-4 text-sm font-semibold text-rose-deep hover:underline">
              Start browsing
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-6">
            {bundles.map((b) => {
              const listed = listedTotalCents(
                b.items.map((i) => ({ priceCents: i.listing.priceCents, isLive: i.listing.status === "LIVE" })),
              );
              const badge = OFFER_BADGE[b.status] ?? OFFER_BADGE.OPEN;
              return (
                <li key={b.id} className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link
                      href={`/store/${b.storefront.slug}`}
                      className="font-display text-lg text-ink hover:text-rose"
                    >
                      {b.storefront.name}
                    </Link>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </div>

                  <ul className="mt-3 flex flex-col gap-2">
                    {b.items.map((it) => {
                      const live = it.listing.status === "LIVE";
                      return (
                        <li key={it.listing.id} className="flex items-center gap-3">
                          {it.listing.images[0] ? (
                            <Image
                              src={it.listing.images[0].url}
                              alt=""
                              width={44}
                              height={44}
                              className="h-11 w-11 rounded-lg object-cover ring-1 ring-line"
                            />
                          ) : (
                            <div className="h-11 w-11 rounded-lg bg-blush/50" />
                          )}
                          <span className={`flex-1 text-sm ${live ? "text-ink" : "text-ink-soft line-through"}`}>
                            {it.listing.title}
                            {!live && " — no longer available"}
                          </span>
                          <span className="text-sm text-ink-soft">
                            ${centsToDollars(it.listing.priceCents)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
                    <span className="text-sm text-ink-soft">Listed total</span>
                    <span className="font-display text-lg text-ink">${centsToDollars(listed)}</span>
                  </div>
                  {b.offerCents != null && (
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-sm text-ink-soft">Your offer</span>
                      <span className="font-display text-lg text-rose">${centsToDollars(b.offerCents)}</span>
                    </div>
                  )}

                  <BagControls
                    bundleId={b.id}
                    status={b.status}
                    items={b.items.map((it) => ({ listingId: it.listing.id, title: it.listing.title }))}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: "Compiled successfully"; `/bag` appears in the route list as `ƒ` (dynamic).

- [ ] **Step 4: Commit**

```bash
git add src/components/bag/BagControls.tsx src/app/bag/page.tsx
git commit -m "feat(4a): buyer /bag page with per-seller bundles, totals, offer controls"
```

---

## Task 7: Seller offers page + accept/decline

**Files:**
- Create: `src/components/sell/OfferActions.tsx`
- Create: `src/app/sell/offers/page.tsx`

- [ ] **Step 1: Create the accept/decline client component (mirrors `CurationActions`)**

Create `src/components/sell/OfferActions.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToOffer } from "@/app/sell/offers/actions";
import { Button } from "@/components/ui/Button";

export function OfferActions({ bundleId }: { bundleId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function respond(accept: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await respondToOffer(bundleId, accept);
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <Button variant="sage" size="sm" disabled={pending} onClick={() => respond(true)}>
          Accept offer
        </Button>
        <Button variant="danger" size="sm" disabled={pending} onClick={() => respond(false)}>
          Decline
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create the seller offers page**

Create `src/app/sell/offers/page.tsx`:

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import { requireSeller } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { centsToDollars } from "@/lib/money";
import { listedTotalCents } from "@/lib/bundle";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Badge } from "@/components/ui/Badge";
import { OfferActions } from "@/components/sell/OfferActions";

export const metadata: Metadata = { title: "Offers" };

export default async function SellOffersPage() {
  const { storefrontId } = await requireSeller();

  const offers = await prisma.bundle.findMany({
    where: { storefrontId, status: "SUBMITTED" },
    orderBy: { updatedAt: "asc" },
    include: {
      buyer: { select: { name: true, email: true } },
      items: {
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              priceCents: true,
              status: true,
              images: { orderBy: { position: "asc" }, take: 1 },
            },
          },
        },
      },
    },
  });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">Seller</p>
            <h1 className="mt-1 font-display text-3xl text-ink">Offers</h1>
          </div>
          <Badge tone="rose">{offers.length} pending</Badge>
        </div>

        {offers.length === 0 ? (
          <div className="grid place-items-center rounded-[20px] border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
            <p className="font-display text-xl italic text-rose">No pending offers.</p>
            <p className="mt-2 text-sm text-ink-soft">Offers from buyers will appear here.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-6">
            {offers.map((b) => {
              const listed = listedTotalCents(
                b.items.map((i) => ({ priceCents: i.listing.priceCents, isLive: i.listing.status === "LIVE" })),
              );
              return (
                <li key={b.id} className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
                  <p className="text-sm text-ink-soft">
                    From {b.buyer.name ?? b.buyer.email}
                  </p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {b.items.map((it) => (
                      <li key={it.listing.id} className="flex items-center gap-3">
                        {it.listing.images[0] ? (
                          <Image
                            src={it.listing.images[0].url}
                            alt=""
                            width={44}
                            height={44}
                            className="h-11 w-11 rounded-lg object-cover ring-1 ring-line"
                          />
                        ) : (
                          <div className="h-11 w-11 rounded-lg bg-blush/50" />
                        )}
                        <span className="flex-1 text-sm text-ink">{it.listing.title}</span>
                        <span className="text-sm text-ink-soft">${centsToDollars(it.listing.priceCents)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
                    <span className="text-sm text-ink-soft">Listed total</span>
                    <span className="font-display text-lg text-ink">${centsToDollars(listed)}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-sm text-ink-soft">Offered</span>
                    <span className="font-display text-lg text-rose">
                      ${centsToDollars(b.offerCents ?? 0)}
                    </span>
                  </div>
                  <OfferActions bundleId={b.id} />
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: "Compiled successfully"; `/sell/offers` appears as `ƒ`.

- [ ] **Step 4: Commit**

```bash
git add src/components/sell/OfferActions.tsx src/app/sell/offers/page.tsx
git commit -m "feat(4a): seller /sell/offers page with accept/decline"
```

---

## Task 8: Bag link + count in the header

**Files:**
- Modify: `src/components/site/SiteHeader.tsx`

- [ ] **Step 1: Make the header async and add a bag link with count**

`SiteHeader` is currently a synchronous Server Component. Change it to async, read the session via `auth()` (does not redirect, unlike `verifySession`), count the buyer's active bag items, and render a bag link before the account link.

At the top of `src/components/site/SiteHeader.tsx`, add imports:

```tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
```

Change the function signature from `export function SiteHeader() {` to:

```tsx
export async function SiteHeader() {
  const session = await auth();
  let bagCount = 0;
  if (session?.user?.id) {
    bagCount = await prisma.bundleItem.count({
      where: {
        bundle: {
          buyerId: session.user.id,
          status: { in: ["OPEN", "SUBMITTED", "ACCEPTED", "DECLINED"] },
        },
      },
    });
  }
```

Then, inside the right-hand `<div className="flex items-center gap-1">`, add this bag link immediately **before** the existing account `<Link>`:

```tsx
          <Link
            href="/bag"
            aria-label="Bag"
            className="relative grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-colors hover:bg-blush hover:text-ink"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 7h12l-1 13H7L6 7z" />
              <path d="M9 7a3 3 0 0 1 6 0" />
            </svg>
            {bagCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose px-1 text-[10px] font-semibold text-paper">
                {bagCount}
              </span>
            )}
          </Link>
```

(`SiteHeader` is already rendered inside async Server Component pages, so awaiting it is fine — it's `await`ed implicitly by JSX since pages render `<SiteHeader />` in an async component. No caller changes needed: an async Server Component used as `<SiteHeader />` is supported.)

- [ ] **Step 2: Build to verify the async header renders everywhere it's used**

Run: `npm run build`
Expected: "Compiled successfully"; home, listing detail, store, sell, admin, account, bag, sell/offers all build.

- [ ] **Step 3: Commit**

```bash
git add src/components/site/SiteHeader.tsx
git commit -m "feat(4a): bag link + live item count in site header"
```

---

## Task 9: Integration smoke + full verification

**Files:**
- Create: `scripts/smoke-bundle.ts`

This exercises the guard idioms directly against the DB (no auth context needed), the automated backstop for the action logic. Page render + the full click-through are verified separately (steps 4–5).

- [ ] **Step 1: Write the DB integration smoke**

Create `scripts/smoke-bundle.ts`:

```ts
// Run with: npx tsx scripts/smoke-bundle.ts
// Seeds a buyer, a seller storefront, and two LIVE listings, then asserts the
// core 4a invariants at the data layer, and cleans up.
import { prisma } from "../src/lib/db";
import { listedTotalCents, offerError } from "../src/lib/bundle";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("SMOKE FAIL: " + msg);
  console.log("ok - " + msg);
}

async function main() {
  const stamp = Date.now();
  const buyer = await prisma.user.create({ data: { email: `smoke-buyer-${stamp}@x.test` } });
  const sellerUser = await prisma.user.create({ data: { email: `smoke-seller-${stamp}@x.test` } });
  const store = await prisma.storefront.create({
    data: { userId: sellerUser.id, name: `Smoke ${stamp}`, slug: `smoke-${stamp}` },
  });
  // Minimal taxonomy refs — reuse any existing Category/Condition.
  const category = await prisma.category.findFirstOrThrow();
  const condition = await prisma.condition.findFirstOrThrow();
  const mk = (title: string, cents: number) =>
    prisma.listing.create({
      data: {
        storefrontId: store.id, title, description: "smoke", priceCents: cents,
        categoryId: category.id, conditionId: condition.id, status: "LIVE",
      },
    });
  const a = await mk("Smoke A", 3400);
  const b = await mk("Smoke B", 2800);

  try {
    // listedTotalCents only counts LIVE
    assert(listedTotalCents([{ priceCents: 3400, isLive: true }, { priceCents: 2800, isLive: false }]) === 3400, "live total excludes non-live");
    // offerError bounds
    assert(offerError(7000, 6200) !== null, "offer over total rejected");
    assert(offerError(5000, 6200) === null, "valid offer accepted");

    // Find-or-create OPEN bundle + add both items
    const bundle = await prisma.bundle.create({ data: { buyerId: buyer.id, storefrontId: store.id, status: "OPEN" } });
    await prisma.bundleItem.createMany({ data: [{ bundleId: bundle.id, listingId: a.id }, { bundleId: bundle.id, listingId: b.id }], skipDuplicates: true });
    // re-add is a no-op (no throw)
    await prisma.bundleItem.createMany({ data: [{ bundleId: bundle.id, listingId: a.id }], skipDuplicates: true });
    const count = await prisma.bundleItem.count({ where: { bundleId: bundle.id } });
    assert(count === 2, "re-add is idempotent (2 items)");

    // submitOffer guard: wrong owner cannot transition
    const wrong = await prisma.bundle.updateMany({ where: { id: bundle.id, buyerId: sellerUser.id, status: { in: ["OPEN", "DECLINED"] } }, data: { status: "SUBMITTED", offerCents: 5000 } });
    assert(wrong.count === 0, "submitOffer rejects non-owner (count 0)");
    // correct owner transitions
    const ok = await prisma.bundle.updateMany({ where: { id: bundle.id, buyerId: buyer.id, status: { in: ["OPEN", "DECLINED"] } }, data: { status: "SUBMITTED", offerCents: 5000 } });
    assert(ok.count === 1, "submitOffer succeeds for owner");

    // respondToOffer guard: wrong storefront cannot accept
    const otherStore = await prisma.storefront.create({ data: { userId: buyer.id, name: `Other ${stamp}`, slug: `other-${stamp}` } });
    const badAccept = await prisma.bundle.updateMany({ where: { id: bundle.id, storefrontId: otherStore.id, status: "SUBMITTED" }, data: { status: "ACCEPTED" } });
    assert(badAccept.count === 0, "respondToOffer rejects non-owning seller");
    const goodAccept = await prisma.bundle.updateMany({ where: { id: bundle.id, storefrontId: store.id, status: "SUBMITTED" }, data: { status: "ACCEPTED" } });
    assert(goodAccept.count === 1, "respondToOffer succeeds for owning seller");

    console.log("\nALL SMOKE CHECKS PASSED");
  } finally {
    // cleanup (order respects FKs)
    await prisma.bundleItem.deleteMany({ where: { bundle: { buyerId: { in: [buyer.id] } } } });
    await prisma.bundle.deleteMany({ where: { buyerId: buyer.id } });
    await prisma.listing.deleteMany({ where: { storefrontId: store.id } });
    await prisma.storefront.deleteMany({ where: { slug: { in: [`smoke-${stamp}`, `other-${stamp}`] } } });
    await prisma.user.deleteMany({ where: { id: { in: [buyer.id, sellerUser.id] } } });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the integration smoke**

Run: `npx tsx scripts/smoke-bundle.ts`
Expected: a series of `ok - …` lines ending in `ALL SMOKE CHECKS PASSED`, and no leftover `smoke-*` rows (cleanup in `finally`).

- [ ] **Step 3: Full automated suite**

Run: `npm run lint; npm test; npm run build`
Expected: lint clean, all Vitest tests pass (including `bundle.test.ts`), build succeeds with `/bag` and `/sell/offers` listed.

- [ ] **Step 4: Authenticated page-render smoke**

Start the prod server on a free port (`$env:PORT=3001; npm run start`), then — because these pages are gated — verify they render for a signed-in user, not just that they redirect. Either:
- log in via the Auth.js credentials flow to obtain a session cookie (as in the Phase 2 auth smoke) and `GET /bag` + `/sell/offers` with that cookie, asserting 200 + expected copy ("Your bag" / "Offers"); or
- if cookie scripting is impractical, do the click-through in step 5 and record it.

Do **not** accept an anonymous 200 (that's the `/login` redirect target) as proof the page rendered.

- [ ] **Step 5: Manual click-through (the acceptance proof for mutations)**

Server actions can't be meaningfully curled, so verify the wired flow in the browser while signed in, and record the result:
1. As a buyer, open a LIVE listing from another seller → "Add to bag" → redirected to `/bag`, item present, header count = 1.
2. Add a second item from the same seller → one bundle, two items, count = 2.
3. Send an offer above the listed total → rejected with the bounds message; a valid offer → status "Offer sent".
4. As the seller (other account), open `/sell/offers` → see the offer → Accept → buyer's `/bag` shows "Offer accepted".
5. Confirm a second seller's item creates a separate bundle, and that you cannot add your own listing (button hidden).

- [ ] **Step 6: Commit**

```bash
git add scripts/smoke-bundle.ts
git commit -m "test(4a): DB integration smoke for bundle guards"
```

---

## Self-review notes (coverage check vs spec)

- §2 ownership/IDOR → atomic `updateMany`/`deleteMany`/`findFirst` scoped by `buyerId`/`storefrontId` in every action (Tasks 3,4) + smoke asserts non-owner gets count 0 (Task 9).
- §2 LIVE-only / single-seller / no self-purchase → `addToBundle` guards (Task 3).
- §2 valid transitions → `canTransition` (Task 2) + atomic from-state guards (Tasks 3,4).
- §2 offer bounds → `offerError` (Task 2), applied in `submitOffer` (Task 3).
- §3 schema (`offerCents`) + find-or-create race → migration + partial unique index (Task 1), catch-and-re-read (Task 3).
- §4 state machine → Tasks 2,3,4; `CHECKED_OUT` intentionally absent (4c).
- §5 actions → Tasks 3,4.
- §6 pages/UI → add-to-bag (Task 5), `/bag` (Task 6), `/sell/offers` (Task 7), header count (Task 8).
- §7 testing → unit (Task 2), integration smoke (Task 9), authenticated render + click-through (Task 9 steps 4–5).
- Deferred (payment/reservation/price-lock/counters/expiry/email) → not implemented; checkout button is a labelled stub (Task 6).
