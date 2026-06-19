# Phase 4b — Stripe Connect (Express) Seller Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a seller connect a Stripe **Express** account so they can receive payouts, and track (via webhook + on-return fetch) whether their account can be charged and receive money — the groundwork 4c (checkout) builds on.

**Architecture:** A new `stripe` server SDK client; a pure `onboardingState` helper (unit-tested); two server actions (`startStripeOnboarding`, `refreshOnboardingStatus`); a `/sell/payouts` page + Stripe return/refresh routes; a signature-verified `account.updated` webhook; and a soft "set up payouts" banner on the seller dashboard. Two new `Storefront` booleans mirror Stripe's `charges_enabled`/`payouts_enabled`.

**Tech Stack:** Next.js 16.2.7 (App Router, server actions, route handlers), Prisma 7 (live Supabase dev DB), `stripe` Node SDK (test mode), Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-06-19-phase-4b-stripe-connect-onboarding-design.md`

**Conventions (read before starting):**
- AGENTS.md: this is **not** the Next.js you know (16.2.7). For any Next API (route handlers, server actions) or Stripe SDK call you're unsure about, read `node_modules/next/dist/docs/` or `node_modules/stripe` types — do NOT guess version-specific details.
- Server actions return `type ActionResult = { error: string } | undefined` (see `src/app/sell/actions.ts`). Ownership is derived from the session (`requireSeller()` in `src/lib/dal.ts`), never from client input.
- Migrations apply to the **live Supabase** dev DB via `DIRECT_URL` (`npm run db:migrate`). The E2E suite runs against that DB with self-cleaning `e2e+*@test.tk` fixtures — **keep port 3000 free of `next dev`** before `npm run test:e2e`.
- UI: reuse `src/components/ui/*` primitives + the warm design tokens. The seller dashboard counts `main ul > li` in E2E — do **not** add a nested `<ul>` under `/sell`'s `<main>`.
- Runtime-deferred honesty: there are no Stripe keys yet, so the real Stripe round-trip cannot be runtime-verified in this phase. Build the code, verify via typecheck/build + the no-Stripe E2E tests, and state the live smoke is deferred.

---

## Task 1: Schema migration — Storefront payout flags

**Files:**
- Modify: `prisma/schema.prisma` (the `Storefront` model)
- Generated: a new folder under `prisma/migrations/`

- [ ] **Step 1: Add the two boolean fields to `Storefront`**

In `prisma/schema.prisma`, inside `model Storefront { ... }`, add these two lines near `stripeAccountId String?`:

```prisma
  stripeChargesEnabled Boolean @default(false)
  stripePayoutsEnabled Boolean @default(false)
```

- [ ] **Step 2: Create + apply the migration to the live dev DB and regenerate the client**

Run: `npm run db:migrate -- --name storefront_stripe_flags`
Expected: Prisma creates `prisma/migrations/<timestamp>_storefront_stripe_flags/`, applies it to Supabase (via `DIRECT_URL`), and runs `prisma generate`. Output ends with "Your database is now in sync with your schema" (or similar) and no errors.

- [ ] **Step 3: Verify the new fields exist on the client**

Run: `npm run build`
Expected: green. (The build typechecks; the new `stripeChargesEnabled`/`stripePayoutsEnabled` fields are now on the generated `Storefront` type. Nothing references them yet, so this just confirms the migration + generate succeeded.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(4b): add Storefront stripeChargesEnabled/stripePayoutsEnabled

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Stripe server SDK client + env

**Files:**
- Create: `src/lib/stripe.ts`
- Modify (LOCAL, not committed — `.env` is gitignored): `.env`

- [ ] **Step 1: Install the Stripe SDK**

Run: `npm i stripe`
Expected: `stripe` added to `dependencies` in `package.json`.

- [ ] **Step 2: Add the env var names to `.env` (local only; leave values blank until you have test keys)**

Append to `.env` (these are read at runtime; blank values mean Stripe calls fail until filled with real **test** keys — that's expected for this phase):

```
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
```

(The Account Link base URL reuses the existing `AUTH_URL`. `.env` is gitignored, so this step is not committed.)

- [ ] **Step 3: Create the server Stripe client**

Create `src/lib/stripe.ts`:

```ts
import "server-only";
import Stripe from "stripe";

// Server-only Stripe client (test mode). STRIPE_SECRET_KEY must be a Stripe TEST
// secret key. We construct the client even when the key is absent so the app
// builds/imports cleanly; any actual API call will fail until the key is set.
//
// NOTE: Stripe's TS types may require an `apiVersion`. Set it to the value the
// INSTALLED `stripe` package expects — check `node_modules/stripe/types` or the
// SDK's exported `Stripe.LatestApiVersion`. Do NOT hardcode a version that
// mismatches the installed SDK (it's a type error). If the installed version
// allows omitting `apiVersion`, omit it.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

/** The app origin used for Stripe Account Link return/refresh URLs. */
export const APP_ORIGIN = process.env.AUTH_URL ?? "http://localhost:3000";
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: green. (If the build errors on a required `apiVersion`, set it per the note in Step 3 — read the installed SDK's types — then re-run.)

- [ ] **Step 5: Commit (do NOT add `.env`)**

```bash
git add package.json package-lock.json src/lib/stripe.ts
git commit -m "feat(4b): stripe server client + sdk dependency

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Pure `onboardingState` helper (TDD)

**Files:**
- Create: `src/lib/stripe-onboarding.ts`
- Test: `src/lib/stripe-onboarding.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/stripe-onboarding.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { onboardingState } from "./stripe-onboarding";

describe("onboardingState", () => {
  it("is not_started when there is no Stripe account", () => {
    expect(onboardingState({ hasAccount: false, chargesEnabled: false, payoutsEnabled: false })).toBe("not_started");
    // hasAccount=false dominates even if flags are somehow true
    expect(onboardingState({ hasAccount: false, chargesEnabled: true, payoutsEnabled: true })).toBe("not_started");
  });

  it("is incomplete when an account exists but charges or payouts are not enabled", () => {
    expect(onboardingState({ hasAccount: true, chargesEnabled: false, payoutsEnabled: false })).toBe("incomplete");
    expect(onboardingState({ hasAccount: true, chargesEnabled: true, payoutsEnabled: false })).toBe("incomplete");
    expect(onboardingState({ hasAccount: true, chargesEnabled: false, payoutsEnabled: true })).toBe("incomplete");
  });

  it("is enabled only when an account exists AND both charges and payouts are enabled", () => {
    expect(onboardingState({ hasAccount: true, chargesEnabled: true, payoutsEnabled: true })).toBe("enabled");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/stripe-onboarding.test.ts`
Expected: FAIL — cannot import `onboardingState` (module/function doesn't exist).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/stripe-onboarding.ts`:

```ts
// Pure onboarding-state logic — no Stripe, no I/O. Unit-tested.

export type OnboardingState = "not_started" | "incomplete" | "enabled";

export function onboardingState(input: {
  hasAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}): OnboardingState {
  if (!input.hasAccount) return "not_started";
  if (input.chargesEnabled && input.payoutsEnabled) return "enabled";
  return "incomplete";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/stripe-onboarding.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full unit suite to confirm nothing regressed**

Run: `npm test`
Expected: all green (the prior 46 + the 3 new = 49).

- [ ] **Step 6: Commit**

```bash
git add src/lib/stripe-onboarding.ts src/lib/stripe-onboarding.test.ts
git commit -m "feat(4b): pure onboardingState helper (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Onboarding server actions

**Files:**
- Create: `src/app/sell/payouts/actions.ts`

- [ ] **Step 1: Write the actions**

Create `src/app/sell/payouts/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSeller } from "@/lib/dal";
import { stripe, APP_ORIGIN } from "@/lib/stripe";

export type ActionResult = { error: string } | undefined;

/**
 * Ensure the caller's storefront has a Stripe Express account, then mint a
 * single-use onboarding Account Link and return its URL for the client to
 * redirect to. Account Links expire, so we always create a fresh one.
 */
export async function startStripeOnboarding(): Promise<{ url: string } | { error: string }> {
  const { storefrontId } = await requireSeller();
  const storefront = await prisma.storefront.findUnique({ where: { id: storefrontId } });
  if (!storefront) return { error: "No storefront found." };

  try {
    let accountId = storefront.stripeAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create({ type: "express" });
      accountId = account.id;
      // Persist scoped to this storefront (ownership already verified).
      await prisma.storefront.update({
        where: { id: storefront.id },
        data: { stripeAccountId: accountId },
      });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${APP_ORIGIN}/sell/payouts/refresh`,
      return_url: `${APP_ORIGIN}/sell/payouts/return`,
      type: "account_onboarding",
    });
    return { url: link.url };
  } catch (err) {
    console.error("startStripeOnboarding failed:", err);
    return { error: "Could not start payout setup. Please try again." };
  }
}

/**
 * Retrieve the connected account from Stripe and sync the stored
 * charges/payouts flags. Safe no-op if no account exists yet.
 */
export async function refreshOnboardingStatus(): Promise<ActionResult> {
  const { storefrontId } = await requireSeller();
  const storefront = await prisma.storefront.findUnique({ where: { id: storefrontId } });
  if (!storefront?.stripeAccountId) return undefined;

  try {
    const account = await stripe.accounts.retrieve(storefront.stripeAccountId);
    await prisma.storefront.update({
      where: { id: storefront.id },
      data: {
        stripeChargesEnabled: account.charges_enabled ?? false,
        stripePayoutsEnabled: account.payouts_enabled ?? false,
      },
    });
    revalidatePath("/sell/payouts");
    revalidatePath("/sell");
    return undefined;
  } catch (err) {
    console.error("refreshOnboardingStatus failed:", err);
    return { error: "Could not refresh payout status. Please try again." };
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: green. (Confirms the Stripe SDK method shapes typecheck against the installed version. If `stripe.accounts.create`/`accountLinks.create`/`accounts.retrieve` signatures differ in the installed SDK, adjust per the SDK types — do not guess.)

- [ ] **Step 3: Commit**

```bash
git add src/app/sell/payouts/actions.ts
git commit -m "feat(4b): startStripeOnboarding + refreshOnboardingStatus actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `/sell/payouts` page + client panel + return/refresh routes

**Files:**
- Create: `src/components/sell/PayoutsPanel.tsx` (client)
- Create: `src/app/sell/payouts/page.tsx` (server)
- Create: `src/app/sell/payouts/return/page.tsx` (server)
- Create: `src/app/sell/payouts/refresh/page.tsx` (server)

- [ ] **Step 1: Client panel (CTA buttons that call the actions)**

Create `src/components/sell/PayoutsPanel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { startStripeOnboarding, refreshOnboardingStatus } from "@/app/sell/payouts/actions";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/inputs";
import type { OnboardingState } from "@/lib/stripe-onboarding";

export function PayoutsPanel({ state }: { state: OnboardingState }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function begin() {
    setError(null);
    startTransition(async () => {
      const r = await startStripeOnboarding();
      if ("error" in r) setError(r.error);
      else window.location.href = r.url; // redirect to Stripe-hosted onboarding
    });
  }

  function refresh() {
    setError(null);
    startTransition(async () => {
      const r = await refreshOnboardingStatus();
      if (r?.error) setError(r.error);
      // success revalidates /sell/payouts; the server re-renders with fresh state
    });
  }

  if (state === "enabled") {
    return (
      <p className="text-sm font-semibold text-sage">Payouts enabled — you're ready to get paid.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={begin} disabled={pending}>
        {pending ? "Working…" : state === "incomplete" ? "Continue setup" : "Set up payouts"}
      </Button>
      {state === "incomplete" && (
        <Button variant="secondary" size="sm" onClick={refresh} disabled={pending} className="self-start">
          Refresh status
        </Button>
      )}
      <FieldError>{error}</FieldError>
    </div>
  );
}
```

- [ ] **Step 2: The payouts page (reads stored flags — no Stripe call on load)**

Create `src/app/sell/payouts/page.tsx`:

```tsx
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireSeller } from "@/lib/dal";
import { onboardingState } from "@/lib/stripe-onboarding";
import { SiteHeader } from "@/components/site/SiteHeader";
import { PayoutsPanel } from "@/components/sell/PayoutsPanel";

export const metadata: Metadata = { title: "Payouts" };

export default async function PayoutsPage() {
  const { storefrontId } = await requireSeller();
  const storefront = await prisma.storefront.findUniqueOrThrow({ where: { id: storefrontId } });
  const state = onboardingState({
    hasAccount: !!storefront.stripeAccountId,
    chargesEnabled: storefront.stripeChargesEnabled,
    payoutsEnabled: storefront.stripePayoutsEnabled,
  });

  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-md px-5 py-12 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">Seller</p>
        <h1 className="mt-1 font-display text-3xl text-ink">Payouts</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          Connect a Stripe account so you can receive money when your pieces sell. Stripe handles
          identity and bank details securely.
        </p>
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <PayoutsPanel state={state} />
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 3: The return route (lands here after Stripe onboarding; syncs status)**

Create `src/app/sell/payouts/return/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { refreshOnboardingStatus } from "@/app/sell/payouts/actions";

// Stripe redirects the seller here when they finish (or exit) hosted onboarding.
// Sync the latest status, then send them to the payouts page to see the result.
export default async function PayoutsReturnPage() {
  await refreshOnboardingStatus();
  redirect("/sell/payouts");
}
```

- [ ] **Step 4: The refresh route (Account Link expired → mint a fresh one)**

Create `src/app/sell/payouts/refresh/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { startStripeOnboarding } from "@/app/sell/payouts/actions";

// Stripe redirects here if the Account Link expired before completion. Mint a
// fresh link and bounce the seller back into Stripe-hosted onboarding. On error,
// fall back to the payouts page.
export default async function PayoutsRefreshPage() {
  const r = await startStripeOnboarding();
  if ("url" in r) redirect(r.url);
  redirect("/sell/payouts");
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run build`
Expected: green; the route table lists `/sell/payouts`, `/sell/payouts/return`, `/sell/payouts/refresh`.

- [ ] **Step 6: Commit**

```bash
git add src/components/sell/PayoutsPanel.tsx src/app/sell/payouts/page.tsx src/app/sell/payouts/return/page.tsx src/app/sell/payouts/refresh/page.tsx
git commit -m "feat(4b): /sell/payouts page, panel, and Stripe return/refresh routes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `account.updated` webhook

**Files:**
- Create: `src/app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Write the webhook route handler**

Create `src/app/api/stripe/webhook/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { Stripe } from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";

// Stripe sends events as raw JSON signed with STRIPE_WEBHOOK_SECRET. We verify
// the signature, then sync charges/payouts flags on account.updated. Unsigned or
// invalid requests are rejected (400). Unhandled event types are acknowledged.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) {
    return new NextResponse("Missing signature", { status: 400 });
  }

  const body = await req.text(); // raw body required for signature verification

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return new NextResponse("Invalid signature", { status: 400 });
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    // Idempotent: scope the update to the storefront owning this account id.
    await prisma.storefront.updateMany({
      where: { stripeAccountId: account.id },
      data: {
        stripeChargesEnabled: account.charges_enabled ?? false,
        stripePayoutsEnabled: account.payouts_enabled ?? false,
      },
    });
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: green; route table lists `/api/stripe/webhook`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/stripe/webhook/route.ts
git commit -m "feat(4b): signature-verified account.updated webhook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Seller dashboard "set up payouts" banner + link

**Files:**
- Modify: `src/app/sell/page.tsx`

- [ ] **Step 1: Compute onboarding state and render a soft banner**

In `src/app/sell/page.tsx`:

1. Add imports at the top:
```tsx
import { onboardingState } from "@/lib/stripe-onboarding";
import { buttonClasses } from "@/components/ui/Button"; // if not already imported
```
2. The page currently does `const { storefrontId } = await requireSeller();` then `prisma.listing.findMany({ where: { storefrontId }, ... })`. ALSO load the storefront's payout flags and compute state. Add after `requireSeller()`:
```tsx
  const storefront = await prisma.storefront.findUniqueOrThrow({
    where: { id: storefrontId },
    select: { stripeAccountId: true, stripeChargesEnabled: true, stripePayoutsEnabled: true },
  });
  const payoutState = onboardingState({
    hasAccount: !!storefront.stripeAccountId,
    chargesEnabled: storefront.stripeChargesEnabled,
    payoutsEnabled: storefront.stripePayoutsEnabled,
  });
```
3. Inside the `<main>`, ABOVE the listings `<ul>`/empty-state block (and NOT inside any `<ul>` — keep `main ul > li` counting only listings), render the banner when not enabled:
```tsx
        {payoutState !== "enabled" && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-soft/60 bg-blush/40 px-5 py-4">
            <p className="text-sm text-ink">
              {payoutState === "incomplete"
                ? "Finish setting up payouts to receive money when your pieces sell."
                : "Set up payouts to receive money when your pieces sell."}
            </p>
            <Link href="/sell/payouts" className={buttonClasses("primary", "sm")}>
              {payoutState === "incomplete" ? "Continue setup" : "Set up payouts"}
            </Link>
          </div>
        )}
```
(`Link` from `next/link` is already imported in this file. Confirm; if not, add it.)

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/app/sell/page.tsx
git commit -m "feat(4b): soft set-up-payouts banner on the seller dashboard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: E2E coverage (no Stripe round-trip needed)

**Files:**
- Create: `e2e/payouts.spec.ts`

These two checks are fully exercisable WITHOUT Stripe keys: a `not_started` seller (no `stripeAccountId`) renders the CTA from stored flags, and the webhook rejects an unsigned request.

- [ ] **Step 1: Write the spec**

Create `e2e/payouts.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { createUser, createStorefront } from "./support/factories";
import { signIn } from "./support/auth";
import { E2E_PASSWORD } from "./support/constants";
import { expectZeroResidue } from "./support/expect-cleanup";

test.describe("4b — Stripe payout onboarding (no Stripe round-trip)", () => {
  test.afterAll(() => expectZeroResidue("payouts.spec"));

  test("a seller with no Stripe account sees the Set up payouts CTA + dashboard banner", async ({ page }) => {
    test.setTimeout(60_000);
    const seller = await createUser({ emailTag: "payouts-seller" });
    await createStorefront(seller.id); // no stripeAccountId → not_started

    await signIn(page, seller.email, E2E_PASSWORD);

    // Dashboard soft banner
    await page.goto("/sell");
    await expect(page.getByRole("link", { name: /set up payouts/i })).toBeVisible();

    // Payouts page CTA (reads stored flags; no Stripe call on load)
    await page.goto("/sell/payouts");
    await expect(page.getByRole("heading", { name: "Payouts" })).toBeVisible();
    await expect(page.getByRole("button", { name: /set up payouts/i })).toBeVisible();
  });

  test("the webhook rejects an unsigned request with 400", async ({ request }) => {
    const res = await request.post("/api/stripe/webhook", {
      data: { hello: "world" }, // no valid stripe-signature header
    });
    expect(res.status()).toBe(400);
  });
});
```

- [ ] **Step 2: Run the new spec**

Ensure nothing is on port 3000 (no `next dev`), then run: `npx playwright test payouts.spec.ts`
Expected: 2 passed. (The first test seeds an `e2e+payouts-seller-…@test.tk` user + storefront, signs in, and asserts the CTAs; the second posts to the webhook with no signature → 400. `expectZeroResidue` cleans up.)

- [ ] **Step 3: Run the full E2E suite to confirm no regression**

Run: `npm run test:e2e`
Expected: all specs green (prior 17 + 2 new = 19), global-teardown reports 0 residue.

- [ ] **Step 4: Commit**

```bash
git add e2e/payouts.spec.ts
git commit -m "test(e2e): 4b payouts CTA + webhook signature gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Final verification + documentation of the runtime-deferred smoke

**Files:**
- (No code) — verification + a short note.

- [ ] **Step 1: Full green gate**

Run, in order (port 3000 free of `next dev`):
- `npm run lint` → clean
- `npm test` → 49 green (46 + 3 onboardingState)
- `npm run build` → green (route table includes `/sell/payouts`, `/sell/payouts/return`, `/sell/payouts/refresh`, `/api/stripe/webhook`)
- `npm run test:e2e` → 19 green, 0 residue

- [ ] **Step 2: Confirm the runtime-deferred boundary is honest**

Confirm in your completion report that the live Stripe round-trip (Express account creation, the hosted onboarding redirect, the real `account.updated` webhook flipping the flags, and the `enabled` confirmation) is **runtime-deferred** — it requires real Stripe **test** keys in `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` and the Stripe CLI (`stripe listen --forward-to localhost:3000/api/stripe/webhook`, which prints the `whsec_…` for `STRIPE_WEBHOOK_SECRET`). Do NOT claim it as runtime-verified.

- [ ] **Step 3: (No commit needed — verification only.)** Then use `superpowers:finishing-a-development-branch` to merge/push.

---

## Self-review notes (coverage of the spec)

- Data model (2 booleans + migration) → Task 1.
- Stripe client + env + `AUTH_URL` base → Task 2.
- Pure `onboardingState` (unit-tested) → Task 3.
- `startStripeOnboarding` / `refreshOnboardingStatus` (ownership-scoped, account-link minting, status sync) → Task 4.
- `/sell/payouts` page (reads stored flags) + return/refresh routes + client panel → Task 5.
- Signature-verified `account.updated` webhook (idempotent `updateMany` by `stripeAccountId`) → Task 6.
- Soft dashboard banner, no hard listing-gate, no nested `<ul>` → Task 7.
- E2E: CTA-renders (no Stripe) + webhook-rejects-unsigned; keep 17 + add 2 → Task 8.
- Runtime-deferred honesty + final green gate → Task 9.
- Out of scope (checkout/commission/escrow/Shippo/messaging) → not touched.
```
