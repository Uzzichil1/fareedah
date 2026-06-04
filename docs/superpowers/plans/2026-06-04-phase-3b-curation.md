# Phase 3b — Admin curation queue (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin review `PENDING_REVIEW` listings and approve them (→ `LIVE`) or reject them (→ `REJECTED` + a reason the seller sees).

**Architecture:** Server Actions gated by `requireAdmin` perform an **atomic, status-guarded** transition via `updateMany({ where: { id, status: "PENDING_REVIEW" }, ... })` (the returned `count` gives a race-safe "already actioned" signal). The `/admin` page renders the pending queue oldest-first; a small client component does approve/reject. A new nullable `Listing.rejectionReason` is added; the 3a `submitListing` clears it on resubmit and the 3a edit page displays it.

**Tech Stack:** Next.js 16.2.7 (App Router, Server Actions), React 19.2, Prisma 7.8, `zod`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-phase-3b-curation-design.md` (read it first).

**Critical context:** deliberately modified Next.js 16 — read `node_modules/next/dist/docs/` before writing Next code. The DAL provides `requireAdmin()` (redirects non-admins to `/`) and `requireSeller()`; `prisma` from `@/lib/db`; `centsToDollars` from `@/lib/money`; status values are string literals (`"PENDING_REVIEW"`, `"LIVE"`, `"REJECTED"`). `@/` → `src/`. Cloudinary creds are absent, but 3b needs no uploads. **Verification honesty:** approve/reject are Server Actions with no REST endpoint, so the through-UI action is a human browser smoke, NOT agent-automated; the queue *rendering* is automatable (controller seeds + admin-session smoke, done after Task 6).

---

## File Structure

**Created:**
- `src/lib/validation/curation.ts` (+ `.test.ts`) — `rejectionSchema`.
- `src/app/admin/actions.ts` — `approveListing`, `rejectListing`.
- `src/components/admin/CurationActions.tsx` — client approve/reject controls.

**Modified:**
- `prisma/schema.prisma` (+ migration) — `Listing.rejectionReason`.
- `src/app/admin/page.tsx` — replace placeholder with the curation queue.
- `src/app/sell/actions.ts` — `submitListing` clears `rejectionReason`.
- `src/app/sell/listings/[id]/edit/page.tsx` — show rejection reason when `REJECTED`.
- `README.md` — Phase 3b note.

---

## Task 1: Add `Listing.rejectionReason` (schema + migration)

**Files:** `prisma/schema.prisma`, `prisma/migrations/**`

- [ ] **Step 1: Add the field**

In `prisma/schema.prisma`, add `rejectionReason String?` to `model Listing` (e.g. right after the `status` line):
```prisma
  status          ListingStatus @default(DRAFT)
  rejectionReason String?
```
(Do not change anything else.)

- [ ] **Step 2: Validate, migrate (live Supabase), generate**

Confirm `.env`'s `DIRECT_URL` host is the intended Supabase project (`kmtbgaayccnqgzjiqspc`...`supabase.com`) WITHOUT printing secrets. Then:
```bash
npx prisma validate
npx prisma migrate dev --name listing-rejection-reason
```
Expected: migration `<ts>_listing_rejection_reason/migration.sql` with `ALTER TABLE "Listing" ADD COLUMN "rejectionReason" TEXT;`, applied, "in sync". Fallback: if DB unreachable → `--create-only` and report apply PENDING. **SAFETY:** if a destructive RESET/drift is prompted, STOP and report BLOCKED — never `--force`.

- [ ] **Step 3: Build**

Run: `npm run build` — Expected: succeeds.

- [ ] **Step 4: Commit**
```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add Listing.rejectionReason for curation"
```

---

## Task 2: Reject reason validation (TDD)

**Files:** `src/lib/validation/curation.ts`, `src/lib/validation/curation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/validation/curation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { rejectionSchema } from "./curation";

describe("rejectionSchema", () => {
  it("accepts a reason of >= 5 chars", () => {
    expect(rejectionSchema.safeParse({ reason: "Blurry photos" }).success).toBe(true);
  });
  it("rejects too-short or empty reasons", () => {
    expect(rejectionSchema.safeParse({ reason: "no" }).success).toBe(false);
    expect(rejectionSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(rejectionSchema.safeParse({ reason: "   " }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/lib/validation/curation.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

Create `src/lib/validation/curation.ts`:
```ts
import { z } from "zod";

export const rejectionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Give a reason of at least 5 characters")
    .max(500),
});

export type RejectionInput = z.infer<typeof rejectionSchema>;
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/lib/validation/curation.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/validation/curation.ts src/lib/validation/curation.test.ts
git commit -m "Add reject-reason validation schema"
```

---

## Task 3: Admin curation actions

**Files:** `src/app/admin/actions.ts`

- [ ] **Step 1: Implement**

Create `src/app/admin/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { rejectionSchema } from "@/lib/validation/curation";

export type ActionResult = { error: string } | undefined;

const NOT_PENDING = "This listing is no longer awaiting review.";

export async function approveListing(id: string): Promise<ActionResult> {
  await requireAdmin();
  const { count } = await prisma.listing.updateMany({
    where: { id, status: "PENDING_REVIEW" },
    data: { status: "LIVE", rejectionReason: null },
  });
  if (count === 0) return { error: NOT_PENDING };
  revalidatePath("/admin");
  return undefined;
}

export async function rejectListing(id: string, rawReason: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = rejectionSchema.safeParse({ reason: rawReason });
  if (!parsed.success) {
    return { error: "Please give a reason of at least 5 characters." };
  }
  const { count } = await prisma.listing.updateMany({
    where: { id, status: "PENDING_REVIEW" },
    data: { status: "REJECTED", rejectionReason: parsed.data.reason },
  });
  if (count === 0) return { error: NOT_PENDING };
  revalidatePath("/admin");
  return undefined;
}
```

- [ ] **Step 2: Build**

Run: `npm run build` — Expected: succeeds (type-checks the actions; `requireAdmin`, `prisma.listing.updateMany`, `rejectionSchema` all exist).

- [ ] **Step 3: Commit**
```bash
git add src/app/admin/actions.ts
git commit -m "Add approve/reject curation actions (atomic, status-guarded)"
```

---

## Task 4: Curation queue UI (`/admin`)

**Files:** `src/components/admin/CurationActions.tsx`, `src/app/admin/page.tsx`

- [ ] **Step 1: Approve/reject client controls**

Create `src/components/admin/CurationActions.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveListing, rejectListing } from "@/app/admin/actions";

export function CurationActions({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function approve() {
    setError(null);
    startTransition(async () => {
      const r = await approveListing(listingId);
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const r = await rejectListing(listingId, reason);
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <button onClick={approve} disabled={pending} className="self-start rounded bg-green-600 px-3 py-1 text-white">
        Approve
      </button>
      <div className="flex gap-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for rejection"
          className="flex-1 rounded border p-1"
        />
        <button onClick={reject} disabled={pending} className="rounded bg-red-600 px-3 py-1 text-white">
          Reject
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Replace the `/admin` placeholder with the queue**

Replace `src/app/admin/page.tsx` contents with:
```tsx
import type { Metadata } from "next";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { centsToDollars } from "@/lib/money";
import { CurationActions } from "@/components/admin/CurationActions";

export const metadata: Metadata = { title: "Curation queue" };

export default async function AdminPage() {
  await requireAdmin(); // redirects non-admins to /

  const listings = await prisma.listing.findMany({
    where: { status: "PENDING_REVIEW" },
    orderBy: { createdAt: "asc" },
    include: {
      images: { orderBy: { position: "asc" } },
      storefront: { select: { name: true } },
      category: { select: { name: true } },
      condition: { select: { name: true } },
      size: { select: { label: true } },
    },
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Curation queue</h1>
      {listings.length === 0 ? (
        <p className="text-zinc-600">No listings awaiting review.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {listings.map((l) => (
            <li key={l.id} className="rounded border p-4">
              {l.images.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {l.images.map((img) => (
                    <Image key={img.id} src={img.url} alt="" width={64} height={64} className="rounded object-cover" />
                  ))}
                </div>
              )}
              <h2 className="font-medium">{l.title}</h2>
              <p className="text-sm text-zinc-500">
                ${centsToDollars(l.priceCents)} · {l.storefront.name}
              </p>
              <p className="text-sm text-zinc-500">
                {l.category.name} · {l.condition.name}
                {l.size ? ` · ${l.size.label}` : ""}
              </p>
              <p className="my-2 text-sm">{l.description}</p>
              <CurationActions listingId={l.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Build**

Run: `npm run build` — Expected: succeeds; `/admin` listed (dynamic).

- [ ] **Step 4: Commit**
```bash
git add src/components/admin/CurationActions.tsx src/app/admin/page.tsx
git commit -m "Add admin curation queue at /admin"
```

---

## Task 5: Cross-phase consistency (clear reason on resubmit; show it to seller)

**Files:** `src/app/sell/actions.ts`, `src/app/sell/listings/[id]/edit/page.tsx`

- [ ] **Step 1: `submitListing` clears `rejectionReason`**

In `src/app/sell/actions.ts`, find the `submitListing` status update:
```ts
  await prisma.listing.update({ where: { id }, data: { status: "PENDING_REVIEW" } });
```
and change it to also clear the reason:
```ts
  await prisma.listing.update({
    where: { id },
    data: { status: "PENDING_REVIEW", rejectionReason: null },
  });
```
(Do not change anything else in the file.)

- [ ] **Step 2: Show the rejection reason on the edit page**

In `src/app/sell/listings/[id]/edit/page.tsx`, the listing is already loaded and `Status: {listing.status}` is shown. Add a rejection-reason banner directly below that status line (the listing object already has `rejectionReason` after Task 1's generate). Add:
```tsx
      {listing.status === "REJECTED" && listing.rejectionReason && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-700">
          Rejected: {listing.rejectionReason}
        </p>
      )}
```
Place it inside the returned `<main>`, after the existing `<p className="mb-2 ...">Status: {listing.status}</p>` line. (The `findUnique` in this page selects the full listing row, so `rejectionReason` is available — no query change needed; if TypeScript reports it missing, run `npx prisma generate` to refresh the client after Task 1.)

- [ ] **Step 3: Build**

Run: `npm run build` — Expected: succeeds.

- [ ] **Step 4: Commit**
```bash
git add src/app/sell/actions.ts "src/app/sell/listings/[id]/edit/page.tsx"
git commit -m "Clear rejectionReason on resubmit; show it to the seller"
```

---

## Task 6: Documentation + final verification

**Files:** `README.md`

- [ ] **Step 1: README note**

In `README.md`, update the Phase 3 status/roadmap to mark **3b (admin curation queue)** as done (3a already done; 3c still pending). Keep it minimal and factual; don't claim 3c (public browse/storefront pages).

- [ ] **Step 2: Full verification**

Run, and confirm all pass:
```bash
npm run lint
npm test
npm run build
```
Expected: all pass; build lists `/admin` (dynamic) plus the existing routes.

- [ ] **Step 3: Commit**
```bash
git add README.md
git commit -m "Document Phase 3b"
```

> **After Task 6 (controller, not a subagent task):** the automated **queue-render smoke** — seed an ADMIN user + a `PENDING_REVIEW` listing (insert a `ListingImage` row directly to satisfy the data shape), log in via the Auth.js REST endpoint, `GET /admin`, and assert the listing renders. The approve/reject *through-UI* action remains a human browser smoke (no REST endpoint for Server Actions).

---

## Self-Review

**Spec coverage:**
- `Listing.rejectionReason` migration → Task 1.
- Reject-reason validation (unit-tested) → Task 2.
- Approve→LIVE (clears reason) / Reject→REJECTED+reason, atomic `updateMany` guarded on status, "already actioned" signal, `requireAdmin` → Task 3.
- `/admin` queue oldest-first with details/images/seller + approve/reject UI → Task 4.
- Cross-phase: `submitListing` clears reason; edit page shows it → Task 5.
- Docs + verification; automated queue-render smoke (controller) → Task 6 + note.

**Placeholder scan:** every code step shows full code; commands show expected output. Task 5 Step 2 inserts a small block into an existing file at a precisely described location.

**Type consistency:** status string literals (`"PENDING_REVIEW"`, `"LIVE"`, `"REJECTED"`) match the `ListingStatus` enum. `ActionResult = {error}|undefined` (admin/actions.ts) mirrors the sell/actions.ts pattern. `CurationActions` calls `approveListing(id)` / `rejectListing(id, reason)` exactly as exported. `revalidatePath` from `next/cache`. `requireAdmin` and `centsToDollars` match the DAL/money modules.

**Verification honesty:** approve/reject through the UI is a human browser smoke (Server Actions have no REST endpoint); only queue rendering is agent-automated. The acceptance criteria say so. After wiring, confirm an approved listing is `LIVE` (not `APPROVED`) in the DB — the fact 3c depends on.

**Known watch-items:** (1) live-DB additive migration (confirm target); (2) generated Prisma client may need `npx prisma generate` after Task 1 for `rejectionReason` to appear in types (offline codegen, not a defect); (3) approve/reject UI verified by human browser smoke, not agent.
