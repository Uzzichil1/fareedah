// cleanup.ts — namespaced E2E fixture teardown.
//
// Thin wrapper around `scripts/e2e-db.ts` (run via `runE2EDb` — see `proc.ts`
// for why this file imports nothing Prisma-related). The actual FK-safe
// deletion logic and `e2e+...@test.tk` scoping live in `scripts/e2e-db.ts`
// (`cleanupE2EData`/`countE2EData`) — this is the single source of truth so
// `globalTeardown`, `scripts/e2e-clean.ts`, and any spec/selftest all run the
// exact same predicate.
import { runE2EDb } from "./proc";

export interface E2ECleanupCounts {
  bundleItems: number;
  bundles: number;
  listings: number;
  storefronts: number;
  users: number;
}

/** Deletes every `e2e+...@test.tk` fixture row in FK-safe order and returns
 *  the per-table deleted counts. Safe to call repeatedly / on an already-clean
 *  DB (returns all-zero counts). */
export function cleanupE2EData(): Promise<E2ECleanupCounts> {
  return runE2EDb<E2ECleanupCounts>("cleanup");
}

/** Counts current `e2e+...@test.tk` rows using the SAME relation predicates
 *  `cleanupE2EData` deletes by (not a narrower count) — used to prove zero
 *  residue after cleanup. */
export function countE2EData(): Promise<E2ECleanupCounts> {
  return runE2EDb<E2ECleanupCounts>("count");
}
