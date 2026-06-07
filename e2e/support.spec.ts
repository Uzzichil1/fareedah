import { test, expect } from "@playwright/test";
import { createUser, createStorefront, createLiveListing, createBundleWithItem } from "./support/factories";
import { cleanupE2EData, countE2EData } from "./support/cleanup";

/**
 * Permanent regression guard for the B2 data-isolation layer (kept rather
 * than deleted as a temporary selftest — it's fully self-contained and cheap
 * to run on every `npm run test:e2e`).
 *
 * Proves the B2 acceptance criterion: "setup creates and teardown removes
 * fixtures with zero residue (verify with a count query)".
 *
 * Self-contained: creates its own fixtures, asserts they exist, runs
 * `cleanupE2EData`, then asserts the e2e namespace count is exactly zero
 * across every table — using the SAME relation predicates cleanup deletes by
 * (see `countE2EData` / `scripts/e2e-db.ts`), so a narrower count can't mask
 * residue.
 *
 * Runs its own cleanup at the end (rather than relying solely on
 * `globalTeardown`, which is global and only fires once at the end of the
 * whole run) so it stays green and self-contained under `npm run test:e2e`
 * regardless of run order or interleaving with future B3-B6 specs.
 */
test("factories create namespaced fixtures and cleanupE2EData proves zero residue", async () => {
  // --- 1. Create a full fixture graph: seller + storefront + LIVE listing,
  //         a buyer, and a bundle with one item (exercises every table the
  //         cleanup predicate touches, including the FK-restrict paths). ---
  const seller = await createUser({ role: "USER", emailTag: "selftest-seller" });
  const storefront = await createStorefront(seller.id);
  const listing = await createLiveListing(storefront.id, { title: "B2 selftest listing" });
  const buyer = await createUser({ role: "USER", emailTag: "selftest-buyer" });
  const bundle = await createBundleWithItem(buyer.id, storefront.id, listing.id);

  expect(seller.email).toMatch(/^e2e\+selftest-seller-.*@test\.tk$/);
  expect(buyer.email).toMatch(/^e2e\+selftest-buyer-.*@test\.tk$/);
  expect(storefront.userId).toBe(seller.id);
  expect(listing.storefrontId).toBe(storefront.id);
  expect(bundle.buyerId).toBe(buyer.id);

  // --- 2. Assert they exist (count > 0 for the e2e namespace). ---
  const before = await countE2EData();
  expect(before.users).toBeGreaterThan(0);
  expect(before.storefronts).toBeGreaterThan(0);
  expect(before.listings).toBeGreaterThan(0);
  expect(before.bundles).toBeGreaterThan(0);
  expect(before.bundleItems).toBeGreaterThan(0);
  console.log("[selftest] before cleanup:", before);

  // --- 3. Run cleanup. ---
  const deleted = await cleanupE2EData();
  console.log("[selftest] cleanupE2EData deleted:", deleted);
  // What we deleted must be >= what existed a moment ago (>= because other
  // specs/processes could be racing in the same namespace under workers=1
  // sequential execution — in practice these will be equal here).
  expect(deleted.users).toBeGreaterThanOrEqual(before.users);
  expect(deleted.storefronts).toBeGreaterThanOrEqual(before.storefronts);
  expect(deleted.listings).toBeGreaterThanOrEqual(before.listings);
  expect(deleted.bundles).toBeGreaterThanOrEqual(before.bundles);
  expect(deleted.bundleItems).toBeGreaterThanOrEqual(before.bundleItems);

  // --- 4. Zero-residue check: the e2e namespace count is now exactly 0
  //         across users/storefronts/listings/bundles/bundleItems. ---
  const after = await countE2EData();
  console.log("[selftest] after cleanup (zero-residue check):", after);
  expect(after).toEqual({ bundleItems: 0, bundles: 0, listings: 0, storefronts: 0, users: 0 });
});
