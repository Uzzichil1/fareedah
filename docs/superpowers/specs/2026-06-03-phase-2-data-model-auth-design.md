# Phase 2 — Data Model + Auth.js (design spec)

**Date:** 2026-06-03
**Branch:** `phase-2-data-model-auth`
**Status:** Approved (ready for implementation planning)

## 1. Purpose & scope

Phase 2 lands two things on the Phase 1 scaffold:

1. **The complete TinyKloset data model** — every entity the app needs
   (identity/roles, storefronts, catalog/taxonomy, listings, commerce/orders,
   bundles, messaging, favorites), replacing the placeholder `HealthCheck`
   model, plus the initial Prisma migration applied to the live Supabase
   database.
2. **Authentication & authorization** via Auth.js v5 — email/password +
   Google sign-in, JWT sessions carrying a role, capability-based
   authorization, optimistic route protection in `proxy.ts`, and a secure
   Data Access Layer.

The schema is the **bulk** of Phase 2; auth is the smaller (but trickier)
part. Later phases build UI/features on top of this stable model — this phase
ships the model + auth plumbing + a minimal auth UI, not the marketplace
features themselves.

### Out of scope (deferred to later phases)

- Listing creation UI, Cloudinary uploads, browse/filter, storefront pages
  (Phase 3).
- Cart/bundle UX, Stripe Connect checkout/escrow/commission, Shippo labels,
  messaging UI (Phase 4).
- Wishlist UI, responsive QA, seed data (Phase 5).
- Stripe/Shippo/Cloudinary **fields** exist on the schema as nullable
  placeholders, but no integration code is written this phase.

## 2. Environment context (non-obvious constraints)

This is a **deliberately modified Next.js 16** (see `AGENTS.md`). Implementers
MUST read the relevant guide under `node_modules/next/dist/docs/` before
writing code. The two that matter here:

- **Middleware is renamed to Proxy** (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`).
  The file is `proxy.ts` at the repo root (or in `src/`), exporting a `proxy`
  function (default or named) + `config.matcher`. **Proxy runs on the Node.js
  runtime** and is intended for *optimistic* checks only — never full
  authorization or DB session validation.
- **Authentication guide** (`.../01-app/02-guides/authentication.md`) prescribes
  the Data Access Layer (DAL) pattern: a memoized `verifySession()` plus role
  checks performed close to the data (Server Components, Server Actions, Route
  Handlers) — **not** in layouts (partial rendering) and **not** solely in
  proxy.

Stack already in place: Next.js 16.2.7 (App Router, Turbopack), React 19.2,
Prisma 7.8 (Rust-free `prisma-client` generator → `src/generated/prisma`,
driver adapters, `prisma.config.ts`), Postgres on Supabase via
`@prisma/adapter-pg`. Connection URLs live in `prisma.config.ts` / the runtime
adapter, **never** in `schema.prisma`. The runtime adapter uses
`ssl: { rejectUnauthorized: false }` for the Supabase pooler.

## 3. Auth architecture

### Library & versions
- `next-auth@5.0.0-beta.31` (Auth.js v5; peer-supports `next ^16`).
- `@auth/prisma-adapter@^2.11.2`.
- `bcryptjs` for password hashing (pure-JS — avoids native build pain on
  Windows dev). `@types/bcryptjs` as a dev dep.

### Session strategy: JWT (required)
Using the **Credentials** provider forces the **JWT** session strategy
(Auth.js does not issue database sessions for credentials sign-in). Therefore:
- No database `Session` table is used (it is dropped from the schema — see §4).
- `role` (and `userId`) are embedded in the JWT via the `jwt` callback and
  surfaced on the session via the `session` callback, so per-request role
  checks do not hit the database.

### Providers
- **Credentials** — email + password. `authorize()` looks up the user by email
  and verifies `passwordHash` with `bcryptjs.compare`. Returns `null` on
  failure (never reveals which field was wrong).
- **Google** — `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- **Apple** — provider code present but **conditionally disabled** unless all
  `APPLE_*` env vars are set (no Apple Developer credentials yet). It must not
  break sign-in or build when unset.

### Runtime simplification
Because Next 16 Proxy runs on the **Node.js runtime**, the usual Auth.js
edge-runtime split (`auth.config.ts` separate from the Prisma-using `auth.ts`)
is **not required**. Use a single `src/auth.ts`. The first implementation task
MUST verify this empirically with `next build` + a protected-route smoke test;
if the single-file config fails to build/run from `proxy.ts`, fall back to the
documented split and record why.

### Files
- `src/auth.ts` — `NextAuth(...)` config exporting `handlers`, `signIn`,
  `signOut`, `auth`. Prisma adapter, JWT strategy, providers, callbacks,
  custom `pages` (`signIn: "/login"`).
- `src/app/api/auth/[...nextauth]/route.ts` — re-exports `handlers` GET/POST.
- `src/proxy.ts` (sibling of `src/app`, NOT repo root) — optimistic redirects only, reading the session from
  the request. Matcher excludes `/api`, `/_next/*`, static assets.
- `src/lib/dal.ts` — the secure Data Access Layer:
  - `verifySession()` — memoized with React `cache`; returns `{ userId, role }`
    or redirects to `/login`.
  - `getCurrentUser()` — fetches the DB user (selected columns only).
  - `requireAdmin()` — asserts `role === "ADMIN"` (else 403/redirect).
  - `requireSeller()` — asserts the current user owns a `Storefront`.
- `src/lib/validation/auth.ts` — Zod schemas (signup, login).
- `src/types/next-auth.d.ts` — module augmentation adding `role`/`id` to
  `Session` and `JWT`.

## 4. Authorization model (capability-based roles)

- `User.role` enum = **`USER | ADMIN`** only.
- **Buying:** any authenticated `USER`.
- **Selling:** unlocked by owning a `Storefront` (1:1 with `User`). "Is a
  seller" ≡ "has a storefront" — never a role change.
- **Admin:** `role = ADMIN` gates the (later) curation queue and admin panel.

Enforcement layers:

| Layer | File | Purpose | DB access |
|-------|------|---------|-----------|
| Optimistic | `proxy.ts` | Redirect unauthenticated → `/login`; non-admin hitting `/admin/*` → `/`. UX pre-filter only. | No |
| Secure | `src/lib/dal.ts` | `requireAdmin()` / `requireSeller()` called inside Server Components, Server Actions, Route Handlers, close to data. | Yes |

UI restrictions alone are never sufficient — every mutation/Server Action does
its own DAL check.

## 5. Data model

Conventions: `cuid()` string ids; `createdAt @default(now())` and
`updatedAt @updatedAt` on all domain models; money as integer **cents**
(`Int`) with a `currency` field defaulting to `"USD"`; enums in `PascalCase`
with `SCREAMING_SNAKE` values; explicit `@@index` on every foreign key and on
columns used for filtering (`status`, `slug`).

### 5.1 Identity / auth
- **User** — `id`, `email` (unique), `emailVerified DateTime?`,
  `passwordHash String?` (null for OAuth-only accounts), `name String?`,
  `image String?`, `role Role @default(USER)`, timestamps. Relations:
  `storefront Storefront?`, `accounts Account[]`, `orders Order[]`,
  `favorites Favorite[]`, `sentMessages Message[]`, conversations.
- **Account** — Auth.js OAuth-link table (provider, providerAccountId, tokens,
  etc.), `@@unique([provider, providerAccountId])`, `userId` FK (cascade).
- **VerificationToken** — Auth.js table for email verification / password
  reset (`identifier`, `token` unique, `expires`), `@@unique([identifier, token])`.
- **No `Session` model** — JWT strategy makes it unused. **Risk/note:**
  `@auth/prisma-adapter` is typed against a client that has `session`; if
  dropping the model causes a TypeScript/adapter error, add a minimal `Session`
  model back (it simply stays empty under JWT). The implementer resolves this
  empirically and records the outcome.
- **Role** enum = `USER | ADMIN`.

### 5.2 Catalog / taxonomy
- **Category** — `id`, `name`, `slug` (unique), `parentId String?` +
  self-relation (`parent`/`children`) for a hierarchy (e.g. Clothing → Tops).
  `listings Listing[]`.
- **Condition** — lookup of item conditions, e.g. "New with tags",
  "Excellent", "Good": `id`, `name`, `slug` (unique), `sortOrder Int`.
- **Size** — children's sizing (e.g. "0–3m", "2T"): `id`, `label`,
  `sortOrder Int`, optional `categoryId` scope. `@@unique` on (`label`,
  `categoryId`) as appropriate.
- **Brand** — `id`, `name` (unique), `slug` (unique). `listings Listing[]`.
  (Modeled rather than free text to support boutique browse/filter in Phase 3.)
- **Storefront** — `id`, `userId` (unique → 1:1), `slug` (unique), `name`,
  `bio String?`, `avatarUrl String?`, `bannerUrl String?`,
  `status StorefrontStatus @default(ACTIVE)`,
  `stripeAccountId String?` (Phase 4), timestamps. `listings Listing[]`,
  `orderItems OrderItem[]`, `bundles Bundle[]`.
  - **StorefrontStatus** enum = `ACTIVE | SUSPENDED | CLOSED`.
- **Listing** — `id`, `storefrontId` FK, `title`, `description`,
  `priceCents Int`, `currency String @default("USD")`, `brandId String?`,
  `categoryId` FK, `conditionId` FK, `sizeId String?`,
  `status ListingStatus @default(DRAFT)`, timestamps.
  `images ListingImage[]`, `favorites Favorite[]`, `orderItems OrderItem[]`.
  Indexes on `storefrontId`, `categoryId`, `brandId`, `status`.
  - **ListingStatus** enum =
    `DRAFT | PENDING_REVIEW | APPROVED | REJECTED | LIVE | SOLD | ARCHIVED`
    (supports the Phase 3 admin curation queue).
- **ListingImage** — `id`, `listingId` FK (cascade), `url`, `position Int`
  (Cloudinary URLs land in Phase 3). `@@index([listingId])`.

### 5.3 Commerce
- **Order** — `id`, `buyerId` FK (User), `status OrderStatus @default(PENDING)`,
  `subtotalCents Int`, `commissionCents Int @default(0)`,
  `shippingCents Int @default(0)`, `totalCents Int`,
  `currency String @default("USD")`, nullable payment/shipping placeholders
  (`stripePaymentIntentId String?`, shipping address fields), timestamps.
  `items OrderItem[]`. Index on `buyerId`, `status`.
  - **OrderStatus** enum =
    `PENDING | PAID | SHIPPED | DELIVERED | COMPLETED | CANCELLED | REFUNDED`.
- **OrderItem** — `id`, `orderId` FK (cascade), `listingId` FK,
  `storefrontId` FK (the seller, for per-seller payout in Phase 4),
  `priceCents Int` (snapshot at purchase), `quantity Int @default(1)`.
  Indexes on `orderId`, `listingId`, `storefrontId`.
- **Bundle** — buyer-grouped items from a single storefront (combined
  shipping / seller offer): `id`, `buyerId` FK, `storefrontId` FK,
  `status BundleStatus @default(OPEN)`, timestamps. `items BundleItem[]`.
  - **BundleStatus** enum = `OPEN | SUBMITTED | ACCEPTED | DECLINED | CHECKED_OUT`.
- **BundleItem** — `id`, `bundleId` FK (cascade), `listingId` FK.
  `@@unique([bundleId, listingId])`.

### 5.4 Social / messaging
- **Conversation** — `id`, `buyerId` FK, `sellerId` FK,
  `listingId String?` (context), timestamps. `messages Message[]`.
  `@@unique([buyerId, sellerId, listingId])` to avoid duplicate threads.
- **Message** — `id`, `conversationId` FK (cascade), `senderId` FK (User),
  `body String`, `readAt DateTime?`, `createdAt`. Index on `conversationId`.
- **Favorite** — `id`, `userId` FK (cascade), `listingId` FK (cascade),
  `createdAt`. `@@unique([userId, listingId])` (this is the Phase 5 wishlist).

## 6. Migration

- Replace `HealthCheck` with the full model above.
- Generate the initial migration (`prisma/migrations/<ts>_init`) and **apply it
  to the live Supabase database** via `npm run db:migrate` (`prisma migrate
  dev`), which uses `DIRECT_URL` from `prisma.config.ts`. The worktree's `.env`
  (copied from the main checkout) holds live credentials.
- Re-generate the Prisma client (`npm run db:generate`).
- If `prisma migrate dev` cannot reach Supabase during implementation, fall
  back to `prisma migrate dev --create-only` (generate SQL without applying)
  and flag that the apply step is pending — do not block the rest of Phase 2.

## 7. Validation, UI & testing

- **Zod** schemas in `src/lib/validation/` (signup, login). Password policy
  matches the Next auth guide (≥8 chars, letter, number, special char).
- **react-hook-form** for the auth forms.
- **Minimal auth UI** (functional, not designed): `/signup`, `/login`, and a
  `logout` Server Action. Enough to exercise the full auth flow end to end.
  A protected `/account` (or `/dashboard`) page demonstrates `verifySession()`,
  and an `/admin` route demonstrates `requireAdmin()` + the proxy redirect.
- **Testing: add Vitest.** Unit tests for: password hash/verify helpers, Zod
  auth schemas, and DAL role/capability logic (`requireAdmin`,
  `requireSeller`). Subagents follow TDD. Add a `test` script
  (`vitest run`) and a `test:watch` script. Pure-logic units are unit-tested;
  the auth wiring itself is verified by `next build` + a manual smoke test.

## 8. Acceptance criteria

1. `npm run lint`, `npm run build`, and `npm test` (Vitest) all pass.
2. `prisma/schema.prisma` contains the full model (no `HealthCheck`); the
   initial migration exists and has been applied to Supabase (or `--create-only`
   with a recorded reason).
3. A user can **sign up** (email/password), **log in**, and **log out**;
   credentials are stored hashed; sessions are JWT and carry `role`.
4. Google sign-in is wired (works given valid env); Apple is present but
   inert when `APPLE_*` is unset, and does not break build or sign-in.
5. `proxy.ts` redirects unauthenticated users away from a protected route and
   non-admins away from `/admin/*`; `src/lib/dal.ts` enforces the same checks
   securely server-side.
6. New env vars (if any beyond those already in `.env.example`) are documented
   in `.env.example`.

## 9. Risks / watch-items

- **Adapter vs. dropped `Session`** (§5.1) — resolve empirically; re-add a
  minimal `Session` model if the adapter requires it.
- **`proxy.ts` + Auth.js wiring** (§3) — verify with a real build before
  building the rest; fall back to the edge split only if needed.
- **Schema size** — the model is large for a single task. Slice implementation
  by entity-group (auth → catalog → commerce → social) so each subagent task
  stays focused; the schema must still compile as a whole after each slice.
- **Live migration** — applying to Supabase is a real, outward-facing change;
  confirm the target project before `migrate dev`.
