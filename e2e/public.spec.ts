import { test, expect } from "@playwright/test";
import { createUser, createStorefront, createLiveListing } from "./support/factories";
import { expectZeroResidue } from "./support/expect-cleanup";

/**
 * B6 — Public/security spec (the FINAL Workstream-B spec).
 *
 * Entirely ANONYMOUS: every Playwright test gets a fresh, cookie-less browser
 * context by default, so there is no `signIn` here — that would defeat the
 * point of locking down the unauthenticated surface. This spec proves the
 * three public/security invariants:
 *
 *   1. `/` (public browse) can NEVER widen beyond `status: "LIVE"`
 *      (`buildListingWhere` in `src/lib/listing-query.ts` hard-pins
 *      `where: { status: "LIVE" }` — there is intentionally no `status`
 *      filter param). A DRAFT listing must not leak even when explicitly
 *      searched for by its exact (unique, stamped) title via `?q=`.
 *   2. `/listings/<id>` for a non-LIVE id 404s — `findFirst({ where: { id,
 *      status: "LIVE" } })` returns null and the page calls `notFound()`
 *      (`src/app/listings/[id]/page.tsx`), which renders Next's default
 *      404 page at HTTP status 404 (no custom `not-found.tsx` yet).
 *   3. Gated routes redirect anonymous visitors to `/login`:
 *        - `/sell`, `/admin`, `/sell/offers` are caught by
 *          `PROTECTED_PREFIXES` in `src/proxy.ts` → `redirect("/login?
 *          callbackUrl=<path>")`.
 *        - `/bag` is NOT proxy-protected, but its page calls
 *          `verifySession()` (`src/lib/dal.ts`), which `redirect("/login")`
 *          (no callbackUrl) when unauthenticated.
 *      Both shapes match `/\/login/`, so a single regex works for all four.
 *
 * Seed (factories — no signup UI needed, this is anonymous browsing): a
 * seller + storefront with one LIVE listing and one DRAFT listing, both
 * stamped with unique titles so `?q=` searches are unambiguous and the
 * residue check has something namespaced to clean up.
 */

test.describe("Public/security invariants (anonymous)", () => {
  test.afterAll(() => expectZeroResidue("public.spec"));

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const liveTitle = `E2E-Public-Live-${stamp}`;
  const draftTitle = `E2E-Public-Draft-${stamp}`;

  // Seeded once in `beforeAll` and shared read-only across the three tests —
  // none of them mutate the seeded rows, so re-seeding per-test would only
  // add ~16s × 3 of pooled-DB round trips for no isolation benefit.
  let draftListingId: string;

  test.beforeAll(async () => {
    // Seeding moved out of the test body and into `beforeAll` runs under the
    // HOOK timeout (default 30s), not a per-test `test.setTimeout`. Four
    // sequential `runE2EDb` calls (each a fresh `tsx` child process against
    // the pooled live DB — see admin.spec's note on the same pattern) measure
    // ~16s and can spike under pooler contention; give this hook the same
    // 60s headroom the other multi-seed specs use.
    test.setTimeout(60_000);

    const seller = await createUser({ emailTag: "seller" });
    const store = await createStorefront(seller.id);
    await createLiveListing(store.id, { title: liveTitle, status: "LIVE" }); // status LIVE is the default but be explicit
    const draftListing = await createLiveListing(store.id, { title: draftTitle, status: "DRAFT" }); // non-LIVE
    draftListingId = draftListing.id;
  });

  test("`/` shows only LIVE listings; a DRAFT never leaks even when searched by exact title", async ({ page }) => {
    // The LIVE listing IS discoverable via the public browse search.
    await page.goto(`/?q=${encodeURIComponent(liveTitle)}`);
    await expect(page.getByText(liveTitle)).toBeVisible();

    // The DRAFT listing must NOT appear — not in a list, not anywhere on the
    // page — even though we're searching for its exact, unique title. This is
    // the LIVE-leak invariant: `buildListingWhere` always pins `status: "LIVE"`,
    // so a DRAFT row can never surface on public browse regardless of query.
    await page.goto(`/?q=${encodeURIComponent(draftTitle)}`);
    await expect(page.getByText(draftTitle)).toHaveCount(0);
  });

  test("`/listings/<non-live-id>` 404s (no findFirst match → notFound())", async ({ page }) => {
    const resp = await page.goto(`/listings/${draftListingId}`);
    // The authoritative check: Next's `notFound()` renders the default 404
    // page at HTTP status 404 (no custom `not-found.tsx` is built yet).
    expect(resp?.status()).toBe(404);
    // Soft confirmation that we actually landed on a 404 page (not, say, a
    // silently-empty 200 detail page) — the default Next 404 copy.
    await expect(page.getByText(/404/)).toBeVisible();
  });

  test("gated routes redirect an anonymous visitor to /login", async ({ page }) => {
    const gatedRoutes = ["/sell", "/admin", "/bag", "/sell/offers"];

    for (const route of gatedRoutes) {
      await page.goto(route);
      // `/sell`, `/admin`, `/sell/offers` are PROTECTED_PREFIXES in
      // `src/proxy.ts` → `/login?callbackUrl=<path>`; `/bag` is reached via
      // `verifySession()` in the DAL → bare `/login`. Both match `/\/login/`.
      // Asserting per-route (rather than collecting failures) means a failure
      // message names exactly which route leaked anonymous access.
      await expect(page, `${route} should redirect anonymous visitors to /login`).toHaveURL(/\/login/);
    }
  });
});
