# Section D — Counter-offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a seller counter a buyer's offer (not just accept/decline), and let the buyer accept, decline, or counter back — unlimited rounds — until someone accepts or declines.

**Architecture:** One new `BundleStatus` value `COUNTERED`. The negotiation ping-pongs `SUBMITTED ⇄ COUNTERED` (SUBMITTED = seller's turn, COUNTERED = buyer's turn); `offerCents` holds the latest proposed amount. The buyer's re-counter reuses the existing `submitOffer` (its from-set is widened to include `COUNTERED`). All proposals are validated by the existing pure `offerError`; all writes are ownership- + status-scoped atomic `updateMany` guards.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 (migrations via `DIRECT_URL`), Auth.js v5, Tailwind v4, vitest, Playwright, `tsx` smoke scripts.

**Spec:** `docs/superpowers/specs/2026-06-22-section-d-counter-offers-design.md`

## Global Constraints

- **Migration MUST be Task 1 (before the `bundle.ts` constant change).** `ACTIVE_BUNDLE_STATUSES`/`PURCHASABLE` are spread into Prisma `where` clauses (`src/app/bag/page.tsx:24`, `src/components/site/SiteHeader.tsx:19`) typed against the *generated* `BundleStatus` enum. Adding `"COUNTERED"` to those constants before `prisma generate` regenerates the enum makes `tsc` fail in those two files. Migrate + generate first.
- **Migration guardrail (execution-critical):** confirm `DIRECT_URL` points at the dev project. The change is additive (`ALTER TYPE "BundleStatus" ADD VALUE 'COUNTERED'`). **If `prisma migrate dev` proposes/requires a RESET or reports drift → STOP and escalate; never accept a reset.**
- **Decisions (locked):** latest-amount-only (no history table); simple bounds — every proposal validated by `offerError` (`0 < amount ≤ listed total`); unlimited rounds.
- **State machine:** `SUBMITTED ⇄ COUNTERED`; `submitOffer` widened to `OPEN/DECLINED/COUNTERED → SUBMITTED` (buyer re-counter); new actions `sellerCounter` (SUBMITTED→COUNTERED), `acceptCounter` (COUNTERED→ACCEPTED), `declineCounter` (COUNTERED→DECLINED); `addItem`/`removeItem` stay `OPEN/DECLINED` only (items frozen during negotiation).
- **`offerCents`** = latest proposed amount; on accept/acceptCounter it is the agreed total (left as-is).
- **All writes** are ownership- + status-scoped atomic guards (no IDOR), matching the existing offer actions.
- **Pure logic in `src/lib/bundle.ts` with vitest.** Verification honesty: distinguish runtime-verified from code-verified; the human signed-in click-through is the final confirmation.

---

### Task 1: Migration — add `COUNTERED` to `BundleStatus`

**Files:**
- Modify: `prisma/schema.prisma` (the `BundleStatus` enum)

**Interfaces:**
- Produces: the generated `BundleStatus` enum (at `@/generated/prisma/client`) gains the `COUNTERED` member, so later tasks can write `status: "COUNTERED"` in Prisma queries.

- [ ] **Step 1: Add the enum value**

In `prisma/schema.prisma`, change the `BundleStatus` enum (insert `COUNTERED` after `SUBMITTED`):
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

- [ ] **Step 2: Confirm the migration target is DEV**

Run: `npx prisma migrate status`
Expected: connects via `DIRECT_URL`, reports the dev DB state, no error. Confirm the host/project ref is the dev project. If not dev, STOP.

- [ ] **Step 3: Create + apply the migration**

Run: `npx prisma migrate dev --name add_countered_status`
Expected: a new `prisma/migrations/<timestamp>_add_countered_status/migration.sql` containing `ALTER TYPE "BundleStatus" ADD VALUE 'COUNTERED';`; output ends "Your database is now in sync with your schema." and runs `prisma generate`.
**If it asks to reset / reports drift → STOP and escalate. Do NOT accept a reset.** (`ALTER TYPE … ADD VALUE` runs outside a transaction — that's expected; if Prisma errors specifically about that, report it rather than hand-editing the DB.)

- [ ] **Step 4: Regenerate + typecheck**

Run: `npx prisma generate`
Run: `npx tsc --noEmit`
Expected: client regenerates with `COUNTERED`; tsc clean (nothing references `COUNTERED` yet, so the extra enum value is simply unused).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(D): add COUNTERED to BundleStatus enum (migration)"
```

---

### Task 2: State machine — `bundle.ts` + tests

**Files:**
- Modify: `src/lib/bundle.ts`
- Modify: `src/lib/bundle.test.ts`

**Interfaces:**
- Consumes: the generated `BundleStatus` enum (now has `COUNTERED`, from Task 1).
- Produces: `BundleStatus` (local union) gains `"COUNTERED"`; `BundleAction` gains `"sellerCounter" | "acceptCounter" | "declineCounter"`; `submitOffer` transition now allows `COUNTERED`; `ACTIVE_BUNDLE_STATUSES` (len 5) and `PURCHASABLE` (len 4) both include `"COUNTERED"`. `canTransition`/`nextStatus`/`listedTotalCents`/`offerError` signatures unchanged.

- [ ] **Step 1: Update the failing tests first**

In `src/lib/bundle.test.ts`, update the two length asserts in the existing "ACTIVE_BUNDLE_STATUSES / PURCHASABLE constants" describe:
- `expect(PURCHASABLE).toHaveLength(3);` → `expect(PURCHASABLE).toHaveLength(4);` and add `expect(PURCHASABLE).toContain("COUNTERED");`
- `expect(ACTIVE_BUNDLE_STATUSES).toHaveLength(4);` → `expect(ACTIVE_BUNDLE_STATUSES).toHaveLength(5);` and add `expect(ACTIVE_BUNDLE_STATUSES).toContain("COUNTERED");`

Add a new describe block (after the existing `canTransition / nextStatus` describe):
```ts
describe("counter-offer transitions", () => {
  it("seller counters only from SUBMITTED → COUNTERED", () => {
    expect(canTransition("SUBMITTED", "sellerCounter")).toBe(true);
    expect(canTransition("OPEN", "sellerCounter")).toBe(false);
    expect(canTransition("COUNTERED", "sellerCounter")).toBe(false);
    expect(nextStatus("sellerCounter")).toBe("COUNTERED");
  });
  it("buyer re-counter is submitOffer from COUNTERED → SUBMITTED", () => {
    expect(canTransition("COUNTERED", "submitOffer")).toBe(true);
    expect(canTransition("OPEN", "submitOffer")).toBe(true);
    expect(canTransition("DECLINED", "submitOffer")).toBe(true);
    expect(canTransition("SUBMITTED", "submitOffer")).toBe(false);
    expect(canTransition("ACCEPTED", "submitOffer")).toBe(false);
    expect(nextStatus("submitOffer")).toBe("SUBMITTED");
  });
  it("buyer accepts/declines a counter only from COUNTERED", () => {
    expect(canTransition("COUNTERED", "acceptCounter")).toBe(true);
    expect(canTransition("COUNTERED", "declineCounter")).toBe(true);
    expect(canTransition("SUBMITTED", "acceptCounter")).toBe(false);
    expect(canTransition("ACCEPTED", "declineCounter")).toBe(false);
    expect(nextStatus("acceptCounter")).toBe("ACCEPTED");
    expect(nextStatus("declineCounter")).toBe("DECLINED");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- bundle`
Expected: FAIL — `sellerCounter`/`acceptCounter`/`declineCounter` aren't valid `BundleAction`s yet (TS/assertion errors), and the length asserts fail (still 3/4).

- [ ] **Step 3: Update `bundle.ts`**

Replace the `BundleStatus` type, the two constants, the `BundleAction` type, and the `TRANSITIONS` map with:
```ts
export type BundleStatus =
  | "OPEN"
  | "SUBMITTED"
  | "COUNTERED"
  | "ACCEPTED"
  | "DECLINED"
  | "CHECKED_OUT";

/** All statuses that represent an active (non-checked-out) bundle, including
 *  declined ones still visible in the buyer's bag and in-flight counters. */
export const ACTIVE_BUNDLE_STATUSES = [
  "OPEN",
  "SUBMITTED",
  "COUNTERED",
  "ACCEPTED",
  "DECLINED",
] as const satisfies readonly BundleStatus[];

/** Subset of statuses where a bundle is purchasable / has meaningful bag weight.
 *  Excludes DECLINED (offer gone) and CHECKED_OUT. COUNTERED is an in-flight
 *  negotiation and counts like SUBMITTED. Used for the bag item count. */
export const PURCHASABLE = [
  "OPEN",
  "SUBMITTED",
  "COUNTERED",
  "ACCEPTED",
] as const satisfies readonly BundleStatus[];

export type BundleAction =
  | "addItem"
  | "removeItem"
  | "submitOffer"
  | "withdrawOffer"
  | "accept"
  | "decline"
  | "sellerCounter"
  | "acceptCounter"
  | "declineCounter";

const TRANSITIONS: Record<BundleAction, { from: BundleStatus[]; to: BundleStatus }> = {
  addItem: { from: ["OPEN", "DECLINED"], to: "OPEN" },
  removeItem: { from: ["OPEN", "DECLINED"], to: "OPEN" },
  submitOffer: { from: ["OPEN", "DECLINED", "COUNTERED"], to: "SUBMITTED" },
  withdrawOffer: { from: ["SUBMITTED"], to: "OPEN" },
  accept: { from: ["SUBMITTED"], to: "ACCEPTED" },
  decline: { from: ["SUBMITTED"], to: "DECLINED" },
  sellerCounter: { from: ["SUBMITTED"], to: "COUNTERED" },
  acceptCounter: { from: ["COUNTERED"], to: "ACCEPTED" },
  declineCounter: { from: ["COUNTERED"], to: "DECLINED" },
};
```
Leave `canTransition`, `nextStatus`, `listedTotalCents`, and `offerError` exactly as they are.

- [ ] **Step 4: Run tests + typecheck (cross-cutting check)**

Run: `npm test -- bundle`
Expected: PASS (existing + 3 new transition tests + updated length asserts).
Run: `npm run lint && npx tsc --noEmit`
Expected: clean. **This confirms the cross-cutting change**: the widened `ACTIVE_BUNDLE_STATUSES`/`PURCHASABLE` (now containing `"COUNTERED"`) still typecheck where spread into the Prisma `where` clauses in `src/app/bag/page.tsx:24` and `src/components/site/SiteHeader.tsx:19` — because Task 1 added `COUNTERED` to the generated enum. (There is no `switch(status)` on `BundleStatus` in `src/` — verified.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/bundle.ts src/lib/bundle.test.ts
git commit -m "feat(D): COUNTERED state + counter transitions in bundle state machine"
```

---

### Task 3: Seller `counterOffer` action

**Files:**
- Modify: `src/app/sell/offers/actions.ts`

**Interfaces:**
- Consumes: `requireSeller` (`@/lib/dal`), `dollarsToCents` (`@/lib/money`), `listedTotalCents`/`offerError` (`@/lib/bundle`).
- Produces: `counterOffer(bundleId: string, counterDollars: string): Promise<ActionResult>` (`ActionResult = { error: string } | undefined`).

- [ ] **Step 1: Add the action**

In `src/app/sell/offers/actions.ts`, add imports and the new action (keep `respondToOffer` unchanged):
```ts
import { dollarsToCents } from "@/lib/money";
import { listedTotalCents, offerError } from "@/lib/bundle";

/** Seller proposes a counter price on a pending (SUBMITTED) offer for their own
 *  storefront's bundle → COUNTERED. */
export async function counterOffer(bundleId: string, counterDollars: string): Promise<ActionResult> {
  const { storefrontId } = await requireSeller();

  const counterCents = dollarsToCents(counterDollars);
  if (counterCents === null) return { error: "Enter a valid amount." };

  const bundle = await prisma.bundle.findFirst({
    where: { id: bundleId, storefrontId, status: "SUBMITTED" },
    select: {
      items: { select: { listing: { select: { priceCents: true, status: true } } } },
    },
  });
  if (!bundle) return { error: "This offer is no longer pending." };

  const listed = listedTotalCents(
    bundle.items.map((i) => ({ priceCents: i.listing.priceCents, isLive: i.listing.status === "LIVE" })),
  );
  const err = offerError(counterCents, listed);
  if (err) return { error: err };

  const { count } = await prisma.bundle.updateMany({
    where: { id: bundleId, storefrontId, status: "SUBMITTED" },
    data: { status: "COUNTERED", offerCents: counterCents },
  });
  if (count === 0) return { error: "This offer is no longer pending." };

  revalidatePath("/sell/offers");
  return undefined;
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/sell/offers/actions.ts
git commit -m "feat(D): seller counterOffer action (SUBMITTED → COUNTERED)"
```

---

### Task 4: Buyer counter actions + widen `submitOffer` + smoke

**Files:**
- Modify: `src/app/bag/actions.ts`
- Create: `scripts/smoke-counter.ts`

**Interfaces:**
- Consumes: `verifySession` (`@/lib/dal`), `listedTotalCents`/`offerError` (`@/lib/bundle`).
- Produces: `acceptCounter(bundleId: string): Promise<ActionResult>`, `declineCounter(bundleId: string): Promise<ActionResult>`; `submitOffer` now also works from `COUNTERED`.

- [ ] **Step 1: Widen `submitOffer` + add the two actions**

In `src/app/bag/actions.ts`:

Add a constant next to `EDITABLE`:
```ts
const OFFERABLE = ["OPEN", "DECLINED", "COUNTERED"] as const;
```
In `submitOffer`, replace BOTH `status: { in: [...EDITABLE] }` occurrences (the `findFirst` load guard and the `updateMany` atomic guard) with `status: { in: [...OFFERABLE] }`. Leave `addToBundle`, `removeFromBundle`, `clearBundle` on `EDITABLE` (items stay frozen during a counter). Leave the `offerError`/`listedTotalCents`/`revalidatePath` logic unchanged.

Add at the end of the file:
```ts
/** Buyer accepts the seller's counter → ACCEPTED (offerCents stays = agreed counter). */
export async function acceptCounter(bundleId: string): Promise<ActionResult> {
  const { userId } = await verifySession();
  const { count } = await prisma.bundle.updateMany({
    where: { id: bundleId, buyerId: userId, status: "COUNTERED" },
    data: { status: "ACCEPTED" },
  });
  if (count === 0) return { error: "This counter is no longer available." };
  revalidatePath("/bag");
  return undefined;
}

/** Buyer declines the seller's counter → DECLINED. */
export async function declineCounter(bundleId: string): Promise<ActionResult> {
  const { userId } = await verifySession();
  const { count } = await prisma.bundle.updateMany({
    where: { id: bundleId, buyerId: userId, status: "COUNTERED" },
    data: { status: "DECLINED" },
  });
  if (count === 0) return { error: "This counter is no longer available." };
  revalidatePath("/bag");
  return undefined;
}
```

- [ ] **Step 2: Write the smoke script**

```ts
// scripts/smoke-counter.ts
// Run with: npx tsx scripts/smoke-counter.ts
// Seeds a buyer + seller storefront + 2 LIVE listings + a SUBMITTED bundle, then
// asserts the counter ping-pong + ownership guards at the data layer, and cleans up.
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { listedTotalCents, offerError } from "../src/lib/bundle";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("SMOKE FAIL: " + msg);
  console.log("ok - " + msg);
}

async function main() {
  const stamp = Date.now();
  const buyer = await prisma.user.create({ data: { email: `smoke-cbuyer-${stamp}@x.test` } });
  const sellerUser = await prisma.user.create({ data: { email: `smoke-cseller-${stamp}@x.test` } });
  const store = await prisma.storefront.create({
    data: { userId: sellerUser.id, name: `Counter ${stamp}`, slug: `smoke-counter-${stamp}` },
  });
  const otherStore = await prisma.storefront.create({
    data: { userId: buyer.id, name: `Other ${stamp}`, slug: `smoke-counter-other-${stamp}` },
  });
  const category = await prisma.category.findFirstOrThrow();
  const condition = await prisma.condition.findFirstOrThrow();
  const mk = (title: string, cents: number) =>
    prisma.listing.create({
      data: {
        storefrontId: store.id, title, description: "smoke", priceCents: cents,
        categoryId: category.id, conditionId: condition.id, status: "LIVE",
      },
    });
  const a = await mk("Counter A", 4000);
  const b = await mk("Counter B", 3000);
  const listed = listedTotalCents([
    { priceCents: 4000, isLive: true },
    { priceCents: 3000, isLive: true },
  ]);

  try {
    // offerError bound applies to counters too
    assert(offerError(listed + 1, listed) !== null, "counter above listed total rejected");
    assert(offerError(5000, listed) === null, "counter within total accepted");

    const bundle = await prisma.bundle.create({
      data: { buyerId: buyer.id, storefrontId: store.id, status: "SUBMITTED", offerCents: 5000 },
    });
    await prisma.bundleItem.createMany({
      data: [{ bundleId: bundle.id, listingId: a.id }, { bundleId: bundle.id, listingId: b.id }],
      skipDuplicates: true,
    });

    // sellerCounter: wrong storefront cannot counter
    const badCounter = await prisma.bundle.updateMany({
      where: { id: bundle.id, storefrontId: otherStore.id, status: "SUBMITTED" },
      data: { status: "COUNTERED", offerCents: 6000 },
    });
    assert(badCounter.count === 0, "sellerCounter rejects non-owning storefront");
    // correct storefront counters
    const okCounter = await prisma.bundle.updateMany({
      where: { id: bundle.id, storefrontId: store.id, status: "SUBMITTED" },
      data: { status: "COUNTERED", offerCents: 6000 },
    });
    assert(okCounter.count === 1, "sellerCounter SUBMITTED → COUNTERED");

    // buyer re-counter (submitOffer from COUNTERED): wrong buyer cannot
    const badRe = await prisma.bundle.updateMany({
      where: { id: bundle.id, buyerId: sellerUser.id, status: { in: ["OPEN", "DECLINED", "COUNTERED"] } },
      data: { status: "SUBMITTED", offerCents: 5500 },
    });
    assert(badRe.count === 0, "buyer re-counter rejects non-owner");
    const okRe = await prisma.bundle.updateMany({
      where: { id: bundle.id, buyerId: buyer.id, status: { in: ["OPEN", "DECLINED", "COUNTERED"] } },
      data: { status: "SUBMITTED", offerCents: 5500 },
    });
    assert(okRe.count === 1, "buyer re-counter COUNTERED → SUBMITTED");

    // seller counters again, buyer accepts the counter
    await prisma.bundle.updateMany({ where: { id: bundle.id, storefrontId: store.id, status: "SUBMITTED" }, data: { status: "COUNTERED", offerCents: 5800 } });
    const accept = await prisma.bundle.updateMany({
      where: { id: bundle.id, buyerId: buyer.id, status: "COUNTERED" },
      data: { status: "ACCEPTED" },
    });
    assert(accept.count === 1, "buyer acceptCounter COUNTERED → ACCEPTED");
    const finalB = await prisma.bundle.findUniqueOrThrow({ where: { id: bundle.id }, select: { status: true, offerCents: true } });
    assert(finalB.status === "ACCEPTED" && finalB.offerCents === 5800, "agreed price = seller's last counter (5800)");

    console.log("\nALL SMOKE CHECKS PASSED");
  } finally {
    await prisma.bundleItem.deleteMany({ where: { bundle: { buyerId: buyer.id } } });
    await prisma.bundle.deleteMany({ where: { buyerId: buyer.id } });
    await prisma.listing.deleteMany({ where: { storefrontId: store.id } });
    await prisma.storefront.deleteMany({ where: { slug: { in: [`smoke-counter-${stamp}`, `smoke-counter-other-${stamp}`] } } });
    await prisma.user.deleteMany({ where: { id: { in: [buyer.id, sellerUser.id] } } });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run the smoke + lint/typecheck**

Run: `npx tsx scripts/smoke-counter.ts`
Expected: `ok - …` lines then `ALL SMOKE CHECKS PASSED`, exit 0.
Run: `npm run lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/bag/actions.ts scripts/smoke-counter.ts
git commit -m "feat(D): buyer acceptCounter/declineCounter + widen submitOffer; counter smoke"
```

---

### Task 5: Seller offers UI — `OfferActions` counter + page

**Files:**
- Modify: `src/components/sell/OfferActions.tsx`
- Modify: `src/app/sell/offers/page.tsx`

**Interfaces:**
- Consumes: `counterOffer`/`respondToOffer` (`@/app/sell/offers/actions`), `centsToDollars` (`@/lib/money`), `listedTotalCents` (`@/lib/bundle`).

- [ ] **Step 1: Add the counter control to `OfferActions`**

Replace `src/components/sell/OfferActions.tsx` with:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToOffer, counterOffer } from "@/app/sell/offers/actions";
import { Button } from "@/components/ui/Button";
import { Input, FieldError } from "@/components/ui/inputs";

export function OfferActions({ bundleId }: { bundleId: string }) {
  const router = useRouter();
  const [counter, setCounter] = useState("");
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

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <Button variant="sage" size="sm" disabled={pending} onClick={() => run(() => respondToOffer(bundleId, true))}>
          Accept offer
        </Button>
        <Button variant="danger" size="sm" disabled={pending} onClick={() => run(() => respondToOffer(bundleId, false))}>
          Decline
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={counter}
          onChange={(e) => setCounter(e.target.value)}
          placeholder="Counter (USD)"
          aria-label="Counter amount in USD"
          inputMode="decimal"
          className="max-w-[10rem]"
        />
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => counterOffer(bundleId, counter))}>
          Counter
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
```

- [ ] **Step 2: Show SUBMITTED + COUNTERED on the offers page**

In `src/app/sell/offers/page.tsx`:

Change the query `where` from `status: "SUBMITTED"` to:
```tsx
    where: { storefrontId, status: { in: ["SUBMITTED", "COUNTERED"] } },
```
Change the pending badge to count only awaiting-seller offers. Replace the `<Badge tone="rose">{offers.length} pending</Badge>` with:
```tsx
        <Badge tone="rose">{offers.filter((o) => o.status === "SUBMITTED").length} pending</Badge>
```
In the per-offer `<li>`, replace the offered-amount row + `<OfferActions>` (the block currently rendering "Offered" and `<OfferActions bundleId={b.id} />`) with a status-aware block:
```tsx
                  {b.status === "SUBMITTED" ? (
                    <>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-sm text-ink-soft">Offered</span>
                        <span className="font-display text-lg text-rose-deep">
                          ${centsToDollars(b.offerCents ?? 0)}
                        </span>
                      </div>
                      <OfferActions bundleId={b.id} />
                    </>
                  ) : (
                    <>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-sm text-ink-soft">You countered</span>
                        <span className="font-display text-lg text-rose-deep">
                          ${centsToDollars(b.offerCents ?? 0)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm italic text-ink-soft">Awaiting buyer…</p>
                    </>
                  )}
```
(The "Listed total" row above this stays unchanged.)

- [ ] **Step 3: Build + lint/typecheck**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/sell/OfferActions.tsx "src/app/sell/offers/page.tsx"
git commit -m "feat(D): seller offers UI — counter control + COUNTERED awaiting-buyer state"
```

---

### Task 6: Buyer bag UI — badge/label + `BagControls` counter branch

**Files:**
- Modify: `src/app/bag/page.tsx`
- Modify: `src/components/bag/BagControls.tsx`

**Interfaces:**
- Consumes: `acceptCounter`/`declineCounter`/`submitOffer` (`@/app/bag/actions`).

- [ ] **Step 1: Bag page — badge + amount label for COUNTERED**

In `src/app/bag/page.tsx`:

Add a `COUNTERED` entry to `OFFER_BADGE`:
```tsx
  COUNTERED: { tone: "rose", label: "Seller countered" },
```
Replace the existing amount-line block (the `{b.offerCents != null && (b.status === "SUBMITTED" || b.status === "ACCEPTED") && (...)}` block) with a status-aware label:
```tsx
                  {b.offerCents != null &&
                    (b.status === "SUBMITTED" || b.status === "COUNTERED" || b.status === "ACCEPTED") && (
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-sm text-ink-soft">
                          {b.status === "SUBMITTED"
                            ? "Your offer"
                            : b.status === "COUNTERED"
                              ? "Seller's counter"
                              : "Agreed price"}
                        </span>
                        <span className="font-display text-lg text-rose-deep">${centsToDollars(b.offerCents)}</span>
                      </div>
                    )}
```

- [ ] **Step 2: `BagControls` — COUNTERED branch**

In `src/components/bag/BagControls.tsx`:

Update the import line to add the two actions:
```tsx
import {
  removeFromBundle,
  clearBundle,
  submitOffer,
  withdrawOffer,
  acceptCounter,
  declineCounter,
} from "@/app/bag/actions";
```
The `status` prop type already includes `"COUNTERED"` via the union `"OPEN" | "SUBMITTED" | "ACCEPTED" | "DECLINED" | "CHECKED_OUT"` — **add `"COUNTERED"`** to that prop union so the new value is accepted:
```tsx
  status: "OPEN" | "SUBMITTED" | "COUNTERED" | "ACCEPTED" | "DECLINED" | "CHECKED_OUT";
```
Add a `COUNTERED` block immediately after the `{status === "SUBMITTED" && (...)}` withdraw block:
```tsx
      {status === "COUNTERED" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button variant="sage" size="sm" disabled={pending} onClick={() => run(() => acceptCounter(bundleId))}>
              Accept counter
            </Button>
            <Button variant="danger" size="sm" disabled={pending} onClick={() => run(() => declineCounter(bundleId))}>
              Decline counter
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="Counter (USD)"
              aria-label="Counter amount in USD"
              inputMode="decimal"
              className="max-w-[10rem]"
            />
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => submitOffer(bundleId, offer))}>
              Counter
            </Button>
          </div>
        </div>
      )}
```
(The existing `editable` block, `SUBMITTED` withdraw block, checkout/clear row, and `FieldError` are unchanged. `COUNTERED` is not `editable`, so items can't be added/removed mid-negotiation.)

- [ ] **Step 3: Build + lint/typecheck**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/bag/page.tsx" src/components/bag/BagControls.tsx
git commit -m "feat(D): buyer bag UI — Seller-countered badge + accept/decline/counter controls"
```

---

### Task 7: End-to-end test + full green

**Files:**
- Create: `e2e/counter-offer.spec.ts`

**Interfaces:**
- Consumes: `createUser`, `createStorefront`, `createLiveListing` (`e2e/support/factories`), `signInAs` (`e2e/support/auth`), `expectZeroResidue` (`e2e/support/expect-cleanup`).

> Bundles + items cascade-clean with the seeded user/storefront, so existing `expectZeroResidue` covers residue with no new teardown code. Identity switches use `context.clearCookies()` + `signInAs`. Settle buttons / use web-first auto-retrying assertions before asserting amounts/badges (the B/C count-race lesson).

- [ ] **Step 1: Write the E2E spec**

```ts
// e2e/counter-offer.spec.ts
import { test, expect } from "@playwright/test";
import { createUser, createStorefront, createLiveListing } from "./support/factories";
import { signInAs } from "./support/auth";
import { expectZeroResidue } from "./support/expect-cleanup";

test.describe("Counter-offers", () => {
  // Negotiation has many steps + identity switches + tsx-subprocess seeding.
  test.setTimeout(90_000);

  test.afterAll(async () => {
    await expectZeroResidue("counter-offer");
  });

  test("buyer offers, seller counters, buyer counters back, seller accepts", async ({ page, context }) => {
    const seller = await createUser({ emailTag: "co-seller" });
    const store = await createStorefront(seller.id);
    const l1 = await createLiveListing(store.id, { title: `Counter Onesie ${Date.now()}`, priceCents: 4000 });
    const l2 = await createLiveListing(store.id, { title: `Counter Hat ${Date.now()}`, priceCents: 3000 });
    const buyer = await createUser({ emailTag: "co-buyer" });

    // Buyer adds two items + sends an offer.
    await signInAs(page, buyer);
    await page.goto(`/listings/${l1.id}`);
    await page.getByRole("button", { name: /add to bag/i }).click();
    await page.waitForURL("**/bag");
    await page.goto(`/listings/${l2.id}`);
    await page.getByRole("button", { name: /add to bag/i }).click();
    await page.waitForURL("**/bag");
    await page.getByLabel("Offer amount in USD").fill("50");
    await page.getByRole("button", { name: /send offer/i }).click();
    await expect(page.getByText(/offer sent/i)).toBeVisible();

    // Seller counters.
    await context.clearCookies();
    await signInAs(page, seller);
    await page.goto("/sell/offers");
    await expect(page.getByText(/offered/i)).toBeVisible();
    await page.getByLabel("Counter amount in USD").fill("65");
    await page.getByRole("button", { name: /^counter$/i }).click();
    await expect(page.getByText(/awaiting buyer/i)).toBeVisible();

    // Buyer sees the counter and counters back.
    await context.clearCookies();
    await signInAs(page, buyer);
    await page.goto("/bag");
    await expect(page.getByText(/seller countered/i)).toBeVisible();
    await expect(page.getByText(/seller's counter/i)).toBeVisible();
    await page.getByLabel("Counter amount in USD").fill("58");
    await page.getByRole("button", { name: /^counter$/i }).click();
    await expect(page.getByText(/offer sent/i)).toBeVisible();

    // Seller accepts the re-countered offer.
    await context.clearCookies();
    await signInAs(page, seller);
    await page.goto("/sell/offers");
    await page.getByRole("button", { name: /accept offer/i }).click();

    // Buyer sees it accepted.
    await context.clearCookies();
    await signInAs(page, buyer);
    await page.goto("/bag");
    await expect(page.getByText(/offer accepted/i)).toBeVisible();
  });

  test("buyer declines a seller counter", async ({ page, context }) => {
    const seller = await createUser({ emailTag: "co2-seller" });
    const store = await createStorefront(seller.id);
    const l1 = await createLiveListing(store.id, { title: `Decline Counter Item ${Date.now()}`, priceCents: 5000 });
    const buyer = await createUser({ emailTag: "co2-buyer" });

    await signInAs(page, buyer);
    await page.goto(`/listings/${l1.id}`);
    await page.getByRole("button", { name: /add to bag/i }).click();
    await page.waitForURL("**/bag");
    await page.getByLabel("Offer amount in USD").fill("40");
    await page.getByRole("button", { name: /send offer/i }).click();
    await expect(page.getByText(/offer sent/i)).toBeVisible();

    await context.clearCookies();
    await signInAs(page, seller);
    await page.goto("/sell/offers");
    await page.getByLabel("Counter amount in USD").fill("48");
    await page.getByRole("button", { name: /^counter$/i }).click();
    await expect(page.getByText(/awaiting buyer/i)).toBeVisible();

    await context.clearCookies();
    await signInAs(page, buyer);
    await page.goto("/bag");
    await page.getByRole("button", { name: /decline counter/i }).click();
    await expect(page.getByText(/offer declined/i)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the new E2E spec**

Ensure port 3000 is free of `next dev` first (the harness builds and runs `next start` on 3000).
Run: `npm run test:e2e -- counter-offer`
Expected: 2 passed; teardown logs zero residue. If a test fails, use systematic debugging — read the trace, find the root cause; do not weaken assertions. (If `/sell/offers` shows a stale extra "Offered" from earlier seeds, the unique `Date.now()` titles + factory namespacing keep this run's bundle distinct; assert on this run's listing titles if disambiguation is needed.)

- [ ] **Step 3: Full green sweep**

Run: `npm run lint`
Run: `npm test` (prior unit suite + the new bundle transition tests)
Run: `npm run build`
Run: `npm run test:e2e` (full suite — confirms the offer-flow + bag/SiteHeader changes didn't regress favorites/follows/public/buyer-offer/responsive/a11y specs)
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add e2e/counter-offer.spec.ts
git commit -m "test(D): counter-offer E2E (offer→counter→re-counter→accept; decline path)"
```

---

## Post-implementation

- [ ] Update `docs/superpowers/yaga-parity-roadmap.md`: set Section D row to `✅ Done` with date + merge commit, link this plan, and flip the "Counter-offer" parity-matrix row to ✅.
- [ ] Human signed-in click-through (offer → counter → counter-back → accept; and a decline) is the final confirmation.

## Self-review notes (coverage map)
- Spec migration → Task 1 (first, guardrailed). State machine (`COUNTERED`, transitions, status sets, widened `submitOffer`) → Task 2 (+tests). Seller `counterOffer` → Task 3. Buyer `acceptCounter`/`declineCounter` + widened `submitOffer` guard + smoke → Task 4. Seller UI (counter control, SUBMITTED+COUNTERED page) → Task 5. Buyer UI (badge, status-aware amount label, COUNTERED controls) → Task 6. Testing (vitest transitions + length asserts, smoke ping-pong/guards, E2E) → Tasks 2, 4, 7. Decisions (latest-amount-only, offerError bounds, unlimited rounds) honored throughout.
