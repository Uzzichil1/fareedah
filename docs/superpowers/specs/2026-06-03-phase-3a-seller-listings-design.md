# Phase 3a — Seller onboarding + Listing create/edit + Cloudinary signed uploads (design spec)

**Date:** 2026-06-03
**Branch:** `phase-3-listings`
**Status:** Approved (ready for implementation planning)

## 1. Purpose & scope

Phase 3 (Listings / Cloudinary / curation / browse / storefronts) is split into
three shippable sub-phases. **This spec covers 3a only:**

> Sellers can open a storefront and create, edit, and submit listings (with
> images) for review.

3a produces listings in **`DRAFT`** and **`PENDING_REVIEW`** states. Nothing
public renders yet, so **the seller dashboard `/sell` plus direct DB inspection
are the acceptance surface** — the dashboard is load-bearing, not polish.

### Deferred (later sub-phases / phases)
- **3b:** admin curation queue — approve `PENDING_REVIEW` → `LIVE`, or reject → `REJECTED`.
- **3c:** public browse/filter, listing detail pages, public storefront pages.
- **P4:** cart/checkout/payments. **P5:** favorites/wishlist UI.
- Storefront **avatar/banner** images are deferred to 3c (storefront pages).

### Builds on
Phase 2 delivered the full schema (incl. `Storefront`, `Listing`,
`ListingImage`, `Category` tree, `Condition`, `Size`, `Brand`), Auth.js (JWT +
`role`), and the DAL (`verifySession`, `requireSeller`, `requireAdmin`). 3a adds
the seller-facing UI and the image pipeline on top.

## 2. Environment constraints (verify-don't-assume)

This is a **deliberately modified Next.js 16** (`AGENTS.md`) — read the relevant
`node_modules/next/dist/docs/` guides before writing code (Server Actions,
`next/image`, forms). Notable for 3a:
- **`next/image` remote images** require `images.remotePatterns` in
  `next.config.ts` (supports `new URL('https://res.cloudinary.com/<cloud>/**')`
  or the object form). Cloudinary URLs won't render until this is added.
- Mutations use **Server Actions**; authorization is enforced in the action via
  the DAL (never trust the client).

**Cloudinary credentials are NOT in `.env`** (all `CLOUDINARY_*` keys are
absent, verified 2026-06-03). Consequence, stated honestly:
- The upload **code** (signature generation, client uploader, `next.config`
  patterns) is built and **unit-tested** (signature is deterministic, testable
  without network) and type/lint/build-verified.
- The **real end-to-end upload to Cloudinary is NOT runtime-verified in 3a** and
  is deferred to a manual smoke once the user adds real `CLOUDINARY_CLOUD_NAME`,
  `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and
  `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` to `.env`. Acceptance criteria reflect this
  split — we do not contrive an upload test.

**Prisma 7 seed wiring (confirmed):** the seed command lives at
`migrations.seed` in `prisma.config.ts` (a string). We use `tsx prisma/seed.ts`
(adds `tsx` dev dep) and expose `npm run db:seed`. `prisma db seed` and
`prisma migrate dev/reset` will also run it.

## 3. Taxonomy seed (`prisma/seed.ts`)

A standalone, **idempotent** seed (upsert on the unique `slug`/`name`), run
against **live Supabase** via `npm run db:seed`. It instantiates its own
`PrismaClient` with the `@prisma/adapter-pg` driver (seed runs outside Next).

Seeded data:
- **Condition** (`name`, `slug`, `sortOrder`): "New with tags", "Excellent",
  "Good", "Fair".
- **Category** tree (`name`, `slug`, `parentId`):
  - Clothing → Tops, Bottoms, Dresses, Outerwear, Sleepwear
  - Footwear
  - Accessories
- **Size** (`label`, `sortOrder`, `categoryId = null` — global): Preemie,
  Newborn, 0–3m, 3–6m, 6–9m, 9–12m, 12–18m, 18–24m, 2T, 3T, 4T, 5T, 6, 7, 8.
- **Brand:** NOT seeded — created on demand (see §6, find-or-create).

Idempotency: re-running the seed must not duplicate rows or error (upsert by
unique key). The seed must confirm the `DIRECT_URL`/`DATABASE_URL` target is the
intended Supabase project before writing.

## 4. Schema change — `ListingImage.publicId`

Add `publicId String?` to `ListingImage` so Cloudinary assets can be deleted
later (when a draft image is removed or a listing is deleted). This is a
**migration applied to live Supabase** (`prisma migrate dev --name
listing-image-public-id`). No other schema changes in 3a.

```prisma
model ListingImage {
  // ...existing fields...
  publicId String?   // Cloudinary public_id, for later asset cleanup
}
```

## 5. Cloudinary signed uploads

**Approach:** browser uploads directly to Cloudinary using a short-lived
signature generated server-side. The unsigned `CLOUDINARY_UPLOAD_PRESET` is
**not used**.

- **Dependency:** add the official `cloudinary` SDK (server-only) for
  `cloudinary.utils.api_sign_request`.
- **`src/lib/cloudinary.ts`:** a small server module that builds the signature.
  Sign the params the client will send: `{ timestamp, folder }` (folder e.g.
  `tinykloset/listings`). Returns the signature plus the public bits the client
  needs. Keep `CLOUDINARY_API_SECRET` server-only (never sent to the client).
- **Server Action `createUploadSignature()`** (`requireSeller`): returns
  `{ timestamp, signature, apiKey, cloudName, folder }`.
- **Client `ImageUploader` component:** for each selected file, calls the action
  for a signature, then `POST`s the file directly to
  `https://api.cloudinary.com/v1_1/<cloudName>/image/upload` with form fields
  `file`, `api_key`, `timestamp`, `folder`, `signature`. On success it reads
  `secure_url` + `public_id` and adds them to the form's image list.
  - **The set of signed params MUST exactly match the params POSTed** (or
    Cloudinary returns `401 Invalid Signature`). The implementer cross-checks
    the exact contract against Cloudinary's current signed-upload docs.
- **Constraints:** 1–8 images per listing; first image (`position = 0`) is the
  primary. Client-side guardrails on count and basic file type/size.
- **`next.config.ts`:** add
  `images: { remotePatterns: [new URL('https://res.cloudinary.com/**')] }` (or
  the object form scoped to the cloud name).
- **Persistence:** images are stored as `ListingImage` rows
  (`url = secure_url`, `publicId = public_id`, `position`).

**Unit-testable seam:** the signature builder in `src/lib/cloudinary.ts` is pure
given `(params, apiSecret)` — tested by asserting it matches the SDK's
`api_sign_request` for fixed inputs (no network).

## 6. Storefront onboarding — `/sell/start`

- **Auth:** uses **`verifySession` only — NOT `requireSeller`** (which redirects
  storefront-less users *to* `/sell/start`; calling it here would loop). If the
  signed-in user **already** has a `Storefront`, redirect to `/sell`.
- **Form:** `name` (required), `slug` (auto-derived from name, editable,
  unique), `bio` (optional). Avatar/banner deferred to 3c.
- **`createStorefront` server action:** slugify the name, ensure uniqueness
  (append a short suffix on collision), create the 1:1 `Storefront` for the
  current user, redirect to `/sell`. Re-check (server-side) that the user has no
  storefront before creating.

## 7. Listing CRUD (seller side)

All seller pages/actions enforce **`requireSeller`** and, for a specific
listing, an **ownership check** (`listing.storefrontId === current storefront`).

- **Dashboard `/sell`:** the seller's listings (title, price, status badge,
  primary image thumbnail) + "New listing". *Acceptance surface.*
- **`/sell/listings/new`** and **`/sell/listings/[id]/edit`:** the listing form —
  `title`, `description`, **price** (entered in dollars, parsed to **integer
  cents** deliberately — no `parseFloat * 100` float math), `category` (select
  from the tree), `condition` (select), `size` (optional select), `brand` (free
  text → find-or-create), `images` (the `ImageUploader`, 1–8).
- **Server actions (`src/app/sell/actions.ts`):**
  - `createListing` → creates a `DRAFT` (lenient validation; partial allowed).
  - `updateListing` → edits an owned `DRAFT`/`REJECTED` listing (incl. images:
    add/remove/reorder; removing an image deletes its `ListingImage` row).
  - `submitListing` → strict validation (title, description, `priceCents > 0`,
    category, condition, **≥1 image**) → sets status `PENDING_REVIEW`.
  - `findOrCreateBrand(name)` → normalize (trim; dedupe by slugified,
    lowercased name); returns the `Brand`.
- **Status machine in 3a:** `DRAFT` ⇄ edit → `submitListing` → `PENDING_REVIEW`.
  `REJECTED` (set later by 3b) is editable and re-submittable. Listings in
  `PENDING_REVIEW` are read-only to the seller (must be returned to draft/edit
  only via the reject path — out of scope here).

## 8. Validation & testing

- **Zod** schemas in `src/lib/validation/listing.ts`: `listingDraftSchema`
  (lenient) and `listingSubmitSchema` (strict, per §7). Storefront schema in
  `src/lib/validation/storefront.ts`.
- **Vitest units:** slug utility (slugify + collision suffix), dollars→cents
  integer parser (incl. edge cases: "10", "10.5", "10.99", "0", invalid),
  brand find-or-create normalization, the Zod schemas, and the Cloudinary
  signature builder (vs SDK output).
- **Build/UI:** `npm run build` is the wiring gate; seller flows are exercised
  on `/sell`. **Real Cloudinary upload deferred** to a user smoke once creds
  exist.

## 9. Acceptance criteria

1. `npm run lint`, `npm run build`, `npm test` all pass.
2. `npm run db:seed` is idempotent and populates Conditions, the Category tree,
   and Sizes in Supabase (re-running causes no duplicates/errors).
3. The `ListingImage.publicId` migration exists and is applied to Supabase.
4. A signed-in user with no storefront visiting `/sell` (or `/sell/listings/new`)
   is sent to `/sell/start`; creating a storefront there lands them on `/sell`;
   visiting `/sell/start` with an existing storefront redirects to `/sell`.
5. A seller can create a `DRAFT` listing, edit it, and **submit** it →
   `PENDING_REVIEW`; the dashboard shows the listing with the correct status
   badge; the row exists in the DB with `priceCents` correct (integer cents) and
   the selected taxonomy FKs set.
6. Brand free-text find-or-creates a `Brand` row (no duplicates for the same
   normalized name).
7. The Cloudinary signature builder is unit-tested; `next.config.ts` allows
   `res.cloudinary.com`. **(Real upload round-trip is code-verified only;
   runtime smoke deferred pending `CLOUDINARY_*` creds — explicitly NOT claimed
   as runtime-verified.)**
8. Authorization: non-sellers can't reach seller pages/actions; a seller can't
   edit another seller's listing (ownership enforced server-side in the DAL/
   actions).
9. New env vars (the `CLOUDINARY_*` set the code reads) are documented in
   `.env.example` (already present from P1 — confirm).

## 10. Risks / watch-items

- **Cloudinary creds absent** (§2) — upload is code-verified only; surface the
  deferred smoke clearly; don't fake it.
- **Signed-upload param matching** (§5) — signed params must equal posted params
  or Cloudinary 401s; verify against current Cloudinary docs.
- **Live-DB writes** — both the taxonomy **seed** and the `publicId` **migration**
  write to live Supabase; confirm the target and keep the seed idempotent.
- **`/sell/start` redirect loop** (§6) — must use `verifySession`, never
  `requireSeller`.
- **Dollars→cents** — parse to integer cents deliberately to avoid float error.
- **Seed runtime** — `tsx prisma/seed.ts` needs the `tsx` dev dep; the seed
  needs its own Prisma client (runs outside Next).
