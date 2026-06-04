# Phase 3b — Admin curation queue (design spec)

**Date:** 2026-06-04
**Branch:** `phase-3b-curation`
**Status:** Approved (ready for implementation planning)

## 1. Purpose & scope

> An admin reviews `PENDING_REVIEW` listings and either **approves** them
> (→ `LIVE`) or **rejects** them (→ `REJECTED` + a reason the seller sees).

This is sub-phase 3b of Phase 3, built on 3a (sellers can submit listings for
review) and Phase 2 (Auth.js + DAL `requireAdmin`). It closes the loop: listings
sellers submitted now get a decision.

**Acceptance surface:** the `/admin` curation queue + DB inspection.

### Verification split (honest, like the P2 signup smoke)
- **Queue rendering is agent-automatable:** seed an admin user + a
  `PENDING_REVIEW` listing (with a directly-inserted `ListingImage` row, since
  Cloudinary creds are absent), log in via the Auth.js REST endpoint, `GET
  /admin`, and confirm the listing appears.
- **Approve/Reject are app-defined Server Actions** with no REST endpoint — they
  cannot be driven headless (the same wall as P2's signup action). Their DB
  transition is **code-verified (build + unit-tested guards) plus a human
  browser smoke**, NOT agent-automated. Acceptance criteria reflect this.

### Deferred
- Seller notifications on approve/reject (no messaging until P4).
- Browsing/acting on non-pending listings (LIVE/REJECTED/etc.).
- Platform settings / commission config.

## 2. Schema change — `Listing.rejectionReason`

Add `rejectionReason String?` to `Listing` (migration applied to live Supabase,
`prisma migrate dev --name listing-rejection-reason`). Additive, nullable. No
other schema change.

```prisma
model Listing {
  // ...existing fields...
  rejectionReason String?
}
```

## 3. Admin actions (`src/app/admin/actions.ts`)

`"use server"`; every action calls `requireAdmin` (from the DAL) first.

- **`approveListing(id)`** — atomically transition only if currently
  `PENDING_REVIEW` → set `status = LIVE` and **clear `rejectionReason`** (a
  previously-rejected, edited, resubmitted listing must not keep stale text).
  If the listing wasn't pending (already actioned / not found), return a
  friendly "already actioned" error.
- **`rejectListing(id, reason)`** — validate `reason` (Zod, min 5 chars);
  atomically transition only if currently `PENDING_REVIEW` → set
  `status = REJECTED` and `rejectionReason = reason`. Same "already actioned"
  handling.

**Race-safety:** use a conditional `updateMany({ where: { id, status:
"PENDING_REVIEW" }, data: {...} })` and check the returned `count` (0 → already
actioned), rather than read-status-then-update. This closes the double-click /
two-admin race atomically and yields the "already actioned" signal for free.

## 4. Curation queue UI (`/admin`)

Replace the placeholder page. `requireAdmin` gates it (the proxy also
optimistically redirects non-admins from `/admin`). It lists `PENDING_REVIEW`
listings **oldest-first (`createdAt asc`)**, each showing: title, price,
description, image thumbnails, the **seller/storefront name**, and
category/condition/size. Each row has:
- an **Approve** action (button), and
- a **Reject** control: a small client component with a reason text input + a
  Reject button (calls `rejectListing(id, reason)`).
Empty state ("No listings awaiting review") when the queue is clear.

## 5. Cross-phase consistency (touches two existing 3a files)

The new `rejectionReason` field interacts with the 3a state machine, so 3b must
update 3a code:

1. **`src/app/sell/actions.ts` — `submitListing` must clear `rejectionReason`**
   when moving a listing to `PENDING_REVIEW`. Otherwise a rejected→edited→
   resubmitted listing re-enters the queue still carrying its old rejection
   text. This is a **requirement**, not a nicety.
2. **`src/app/sell/listings/[id]/edit/page.tsx` — show the rejection reason**
   when `status === "REJECTED"`, so the seller knows what to fix before
   resubmitting (3a already lets them edit + resubmit a `REJECTED` listing).

## 6. Validation & testing

- **Zod** `rejectionSchema` (reason min 5, max ~500) in
  `src/lib/validation/curation.ts` — unit-tested (accept/reject cases).
- A pure guard helper (e.g. `isPending(status)` / actionable check) —
  unit-tested.
- **Queue-render smoke (automatable):** per §1, seed admin + pending listing +
  image row, log in, `GET /admin`, assert the listing renders.
- **Approve/Reject transition:** code-verified (build + the unit-tested guard/
  schema) and a **human browser smoke** (log in as admin → `/admin` → approve
  one, reject one with a reason → verify in `/sell` (seller sees REJECTED +
  reason) and in the DB).

## 7. Acceptance criteria

1. `npm run lint`, `npm test`, `npm run build` all pass.
2. The `Listing.rejectionReason` migration exists and is applied to Supabase.
3. `/admin` (as an ADMIN) renders the `PENDING_REVIEW` queue oldest-first with
   each listing's details, images, and seller; non-admins are redirected away
   (proxy + `requireAdmin`). **Queue rendering is verified by an automated
   admin-session smoke.**
4. `approveListing` moves a `PENDING_REVIEW` listing to **`LIVE`** (verify in DB
   — `LIVE`, not `APPROVED`) and clears `rejectionReason`; `rejectListing` moves
   it to `REJECTED` with the reason stored. The transition is atomic
   (`updateMany` guarded on `status = PENDING_REVIEW`); acting on a
   non-pending listing returns a friendly error. **(Transition is code-verified
   + unit-tested guard/schema; the through-the-UI action is a human browser
   smoke, NOT agent-automated.)**
5. Resubmitting a `REJECTED` listing (`submitListing`) clears its
   `rejectionReason`; the seller sees the reason on the edit page while it's
   `REJECTED`.
6. Authorization: every admin action enforces `requireAdmin`; a non-admin can't
   approve/reject (server-side, not just hidden UI).

## 8. Risks / watch-items

- **Verification honesty** (§1) — don't claim the approve/reject UI action is
  agent-verified; it's a human browser smoke.
- **Cross-phase clear-on-resubmit** (§5.1) — easy to miss; it's a requirement.
- **Live-DB migration** — additive nullable column; confirm the Supabase target.
- **Atomic transition** (§3) — use `updateMany` guarded on status; check count.
- **The fact 3c depends on:** after wiring, confirm an approved listing is
  actually `LIVE` in the DB (not `APPROVED`).
