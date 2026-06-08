// expect-cleanup.ts — the shared `afterAll` zero-residue assertion.
//
// The buyer/seller/admin specs each end by running `cleanupE2EData` and proving
// `countE2EData` is all-zero. That block was duplicated verbatim across specs;
// it lives here once instead.
//
// IMPORTANT: this is its OWN file and pulls in `@playwright/test` — do NOT move
// it into `cleanup.ts`. `cleanup.ts` is imported by the `tsx`-run scripts
// (`scripts/e2e-clean.ts`, `global-teardown`), which must NOT load Playwright.
import { expect } from "@playwright/test";
import { cleanupE2EData, countE2EData } from "./cleanup";

/** Runs `cleanupE2EData`, logs the deleted counts under `label`, then asserts
 *  zero residual `e2e+...@test.tk` rows. Intended for use in `test.afterAll`. */
export async function expectZeroResidue(label: string): Promise<void> {
  const deleted = await cleanupE2EData();
  console.log(`[${label}] cleanupE2EData deleted:`, deleted);
  expect(await countE2EData()).toEqual({
    bundleItems: 0,
    bundles: 0,
    listings: 0,
    storefronts: 0,
    users: 0,
  });
}
