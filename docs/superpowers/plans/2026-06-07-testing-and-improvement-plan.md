# TinyKloset — Testing & Improvement Plan (pre-payments hardening)

**Date:** 2026-06-07
**Status:** Draft for review
**Goal:** Before building payments (4b/4c), harden the existing surface: fix known bugs, add an automated regression net for the auth-gated flows, polish UX/accessibility, fill in missing essentials, and make the data demo-ready.

**Explicitly out of scope:** Stripe Connect onboarding (4b), checkout/escrow (4c), Shippo (4d), messaging (4e). This plan covers everything *up to* the point of taking money.

**How this gets executed:** Five workstreams (A–E). Each is run as its own subagent-driven pass (fresh implementer + spec/quality review per task), in the recommended sequence at the end. This document is the roadmap; a workstream may be expanded into finer steps at execution time.

---

## Current state (why this plan)

- **Tests:** Vitest unit tests only, and only for pure logic (`money`, `slug`, `validation/*`, `listing-query`, `bundle`, `authz`, `password`, `brands`, `cloudinary`). **No tests exist for server actions, pages, or components, and there is no E2E framework.** Every auth-gated flow has only ever been verified by hand or a one-off DB smoke (`scripts/smoke-bundle.ts`).
- **Known defects found this session:** misleading submit-validation message (fixed, *uncommitted*); New-listing form creates a fresh DRAFT on every failed submit (root cause of fareedah's 5 duplicate "Formal shirt" drafts); bag count includes declined/non-LIVE items; declined bundle card still shows "Your offer".
- **Missing essentials:** storefront is create-only (no edit of name/bio/avatar/banner despite the columns existing); account page has no profile/password editing; no custom error boundary or 404 page; no route-level loading states.
- **Data:** leftover test rows (fareedah's duplicate drafts) and a sparse catalogue that makes the browse grid look empty.

---

## Workstream A — Bug fixes (fast wins)

**A1. Submit-validation-message fix — DONE & committed (2026-06-07).** `listingSubmitSchema` now has per-rule messages and `submitListing` returns the specific failing rule(s) instead of the lumped sentence.
- Files: `src/lib/validation/listing.ts`, `src/app/sell/actions.ts`.
- Acceptance (met): submitting a listing with an 8-char description returns "Description must be at least 10 characters".

**A2. Stop the New-listing form creating duplicate drafts on failed submit.**
- Root cause: on `/sell/listings/new` the form has no `listingId`, so `run(submit=true)` calls `createListing` (a NEW draft) then `submitListing`; when submit fails, the draft persists and the next retry creates another draft.
- Fix: in `src/components/sell/ListingForm.tsx`, track the id created during this session in state (`const [createdId, setCreatedId] = useState(listingId)`); use `const id = createdId ?? listingId`; after a successful `createListing`, `setCreatedId(r.id)`. Subsequent retries then `updateListing` the same draft instead of creating new.
- Acceptance: repeatedly failing then succeeding submit on a new listing yields exactly ONE listing row (manual + covered by E2E B-flow seller test).

**A3. Bag count should reflect active, purchasable items.**
- `src/components/site/SiteHeader.tsx` currently counts `bundleItem`s across OPEN/SUBMITTED/ACCEPTED/**DECLINED** bundles regardless of listing status.
- Fix: count only items whose bundle is OPEN/SUBMITTED/ACCEPTED **and** whose listing is `status: "LIVE"` (`where: { bundle: { buyerId, status: { in: ["OPEN","SUBMITTED","ACCEPTED"] } }, listing: { status: "LIVE" } }`).
- Acceptance: a declined bundle and a sold/removed item don't inflate the badge.

**A4. Declined bundle card shouldn't show a live "Your offer" row.**
- `src/app/bag/page.tsx`: only render the "Your offer" row when `offerCents != null` **and** status is `SUBMITTED` or `ACCEPTED` (not `DECLINED`). The "Offer declined" badge already conveys the state.
- Acceptance: a declined bundle shows the badge but no stale offer amount.

**A5. Shared status constant (small DRY).**
- The list `["OPEN","SUBMITTED","ACCEPTED","DECLINED"]` is duplicated in `bag/page.tsx` and `SiteHeader.tsx`. Extract `ACTIVE_BUNDLE_STATUSES` (and a `PURCHASABLE` subset) to `src/lib/bundle.ts` and import both places.
- Acceptance: one source of truth; build green.

---

## Workstream B — E2E tests (Playwright) — the regression net

**B1. Install & configure Playwright.**
- `npm i -D @playwright/test` then `npx playwright install chromium`.
- Add `playwright.config.ts`: `testDir: "e2e"`, `use.baseURL` from `process.env.E2E_BASE_URL ?? "http://localhost:3000"`, a `webServer` block that runs `npm run start` (prod build) on a dedicated port and reuses an already-running server locally, single worker (the suite mutates shared DB).
- Scripts: `"test:e2e": "playwright test"`, `"test:e2e:ui": "playwright test --ui"`.
- Acceptance: `npx playwright test` runs an empty/placeholder spec green.

**B2. Data isolation + helpers (`e2e/support/`).**
- All E2E fixtures are namespaced with a per-run stamp (e.g. `e2e+<stamp>@test.tk`) and removed in teardown — mirror `scripts/smoke-bundle.ts`'s self-cleaning approach using the Prisma client.
- Helpers: `createUser(role?)`, `createStorefront(userId)`, `createLiveListing(storefrontId, overrides)`, `signIn(page, email, password)` (drives the real `/login` UI), and a `globalTeardown` that deletes all `e2e+*` rows in FK-safe order.
- **DB (decided):** E2E runs against the **live Supabase dev DB** using namespaced (`e2e+*`) fixtures that self-clean in `globalTeardown`. A dedicated Supabase branch/project for E2E is a future option, not required now. Mitigate killed-run residue with a standalone `npm run e2e:clean` that deletes any stray `e2e+*` rows.
- Acceptance: setup creates and teardown removes fixtures with zero residue (verify with a count query).

**B3. Seller journey spec (`e2e/seller.spec.ts`).** Sign up → open storefront (`/sell/start`) → create a listing → attempt submit with an 8-char description → **assert the specific "Description must be at least 10 characters" error** → fix description → submit → listing is `PENDING_REVIEW`. Also asserts A2: only one listing row exists after the failed-then-successful submit.

**B4. Admin curation spec (`e2e/admin.spec.ts`).** Seed a `PENDING_REVIEW` listing; sign in as an ADMIN; `/admin` → Approve → listing becomes `LIVE` and appears on `/`. Then a second listing → Reject with reason → seller's edit page shows the rejection reason.

**B5. Buyer + offer spec (`e2e/buyer-offer.spec.ts`).** Seed a seller with two LIVE listings; sign up as a buyer; browse → open a listing → Add to bag → `/bag` shows it, header count = 1 → add second → one bundle, 2 items → submit an offer above the listed total → **assert rejection** → submit a valid offer → "Offer sent". Then sign in as the seller → `/sell/offers` → Accept → buyer's `/bag` shows "Offer accepted". Assert a buyer cannot add their own listing (button absent).

**B6. Public/security spec (`e2e/public.spec.ts`).** Anonymous: `/` shows only LIVE listings; a DRAFT/PENDING listing never appears; `/listings/<non-live-id>` → 404; gated routes (`/sell`, `/admin`, `/bag`, `/sell/offers`) redirect to `/login`. (Locks the LIVE-leak + auth invariants.)
- Acceptance for B3–B6: all specs green locally via `npm run test:e2e`; documented one-command run.

---

## Workstream C — UX & accessibility

**C1. Route-level loading states.** Add `loading.tsx` skeletons (using the design tokens) for the data-fetching routes: `/`, `/bag`, `/sell`, `/sell/offers`, `/admin`, `/listings/[id]`, `/store/[slug]`.
- Acceptance: navigating shows a branded skeleton, not a blank flash.

**C2. Accessibility pass.**
- Bag count badge: add `aria-label={`${bagCount} items in bag`}` (and `aria-hidden` on the visual number).
- Form error text: render via a consistent `FieldError`/`role="alert"` (aria-live polite) so screen readers announce validation failures (`AddToBagButton`, `BagControls`, `OfferActions`, `CurationActions` currently use bare `<p>`).
- Verify every input has an associated `<label htmlFor>`/`id` (forms mostly do via `Label`; audit `FilterBar` and `BagControls` inputs — add `aria-label`s where there's no visible label).
- Add a "Skip to content" link in the layout; ensure `<main>` has an `id`.
- Confirm `:focus-visible` styles on all links (Button has them; nav/links need a visible focus ring).
- Re-verify small `text-rose` usages meet AA (we added `rose-deep` for links; sweep for any remaining small rose text).
- Acceptance: keyboard-only can complete the buyer + seller journeys; axe/Lighthouse a11y has no critical violations on `/`, `/listings/[id]`, `/login`, `/bag`.

**C3. Mobile pass.** Audit `FilterBar` (pill row should scroll or wrap cleanly on narrow screens), header on small widths, tap-target sizes (≥44px), and the two-column listing detail collapsing. Fix overflow issues found.
- Acceptance: no horizontal overflow at 360px width on `/`, `/listings/[id]`, `/bag`, `/sell/listings/new`.

**C4. (Optional) Optimistic bag updates.** Use `useOptimistic` for add/remove so the bag feels instant. Lower priority; include only if time permits.

---

## Workstream D — Missing essentials

**D1. Edit storefront (name, bio, avatar, banner).** The `Storefront.avatarUrl`/`bannerUrl` columns exist but have no UI.
- Add `editStorefront(raw)` action (`src/app/sell/actions.ts`) — `verifySession`, load the caller's storefront, update name/bio/avatarUrl/bannerUrl; keep slug stable.
- Add a `/sell/storefront` page + extend `StorefrontForm` (or a new `StorefrontEditForm`) to support edit mode, reusing the `ImageUploader`/signed-Cloudinary flow for avatar + banner. Link it from the seller dashboard.
- Acceptance: a seller can set an avatar/banner/bio and they render on `/store/[slug]` (which already displays them).

**D2. Edit account (name + change password).** `/account` is read-only + logout.
- Add `updateProfile(name)` and `changePassword(current, next)` actions (validate current via bcrypt; reuse `password.ts`). Add a small form to `/account`.
- Acceptance: name change reflects in header/account; password change lets you log in with the new password and rejects a wrong current password.

**D3. Error boundary + custom 404.**
- Add `src/app/error.tsx` (client error boundary with a branded "something went wrong" + retry) and `src/app/not-found.tsx` (branded 404 with a link home). Optionally `global-error.tsx`.
- Acceptance: a thrown error shows the boundary, a bad URL shows the styled 404 (not the default).

**D4. Listing lifecycle: archive / mark unavailable.** Sellers can only edit DRAFT/REJECTED; there's no way to take a LIVE listing down.
- Add an `archiveListing(id)` action (LIVE→ARCHIVED, ownership-scoped atomic `updateMany`) and an Archive button on the seller dashboard/edit page. (Deletion left out — archive preserves order history for later phases.)
- Acceptance: archived listings disappear from public browse/storefront; remain visible to the seller as ARCHIVED.

---

## Workstream E — Data & demo readiness

**E1. Clean up leftover test data.** Remove fareedah's 4 duplicate "Formal shirt" drafts (keep the one she chooses) and any other stray smoke rows. (Quick DB action.)
- Acceptance: `/sell` shows a clean listing list for fareedah.

**E2. Richer demo seed.** Extend `prisma/seed.ts` (kept idempotent) with 2–3 demo storefronts and ~12–20 LIVE listings spread across categories/sizes/brands/conditions, using stable placeholder image URLs. Gated behind a `SEED_DEMO=1` env flag so the taxonomy seed stays separate from demo content.
- Acceptance: `SEED_DEMO=1 npm run db:seed` populates a browsable catalogue; re-running doesn't duplicate.

**E3. (Optional) Demo reset script.** `scripts/reset-demo.ts` to wipe + reseed demo content (never touches real users). Include only if useful.

---

## Recommended sequence

1. **A (bug fixes)** + **E1 (data cleanup)** — small, immediate, removes confusion. Commit early.
2. **B (Playwright E2E)** — establish the regression net *before* the larger C/D changes, so polish/refactors can't silently break the core journeys. B3/B5 also lock in the A1/A2 fixes.
3. **D (missing essentials)** — storefront/account edit, error/404 pages, archive. New surface, guarded by B.
4. **C (UX & a11y)** — polish across the now-complete surface (incl. the new D pages).
5. **E2 (demo seed)** — last, so the catalogue reflects the finished UI.

Then proceed to **Phase 4b (Stripe Connect onboarding)**.

## Acceptance for the whole plan
- `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build` all green.
- The four core journeys (seller-list, admin-curate, buyer-bag-offer, public-browse) are covered by passing E2E specs.
- Known defects A1–A4 fixed; storefront edit, account edit, error/404 pages, and archive shipped.
- No a11y critical violations on the key pages; no mobile overflow at 360px.
- Demo seed produces a populated, realistic catalogue.
