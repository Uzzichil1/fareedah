// global-teardown.ts — removes every namespaced `e2e+...@test.tk` fixture
// row after the full Playwright run completes (wired via
// `playwright.config.ts`'s `globalTeardown`).
//
// Delegates to `cleanupE2EData` (see `support/cleanup.ts`), which itself runs
// the FK-safe deletion in `scripts/e2e-db.ts` via a child `tsx` process — see
// the architecture note atop that file for why (Prisma 7's generated client
// is ESM-only and cannot be loaded directly under Playwright's transform).
import { cleanupE2EData } from "./support/cleanup";

export default async function globalTeardown() {
  const counts = await cleanupE2EData();
  console.log(
    "[global-teardown] removed e2e+ fixtures:",
    `users=${counts.users}`,
    `storefronts=${counts.storefronts}`,
    `listings=${counts.listings}`,
    `bundles=${counts.bundles}`,
    `bundleItems=${counts.bundleItems}`
  );
}
