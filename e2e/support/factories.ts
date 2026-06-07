// factories.ts — namespaced E2E fixture factories.
//
// Thin wrappers around `scripts/e2e-db.ts` (run via `runE2EDb`, a child `tsx`
// process — see `proc.ts` for why). Each factory returns the created row(s)
// as plain JSON-serializable objects. All fixtures are namespaced under
// `e2e+...@test.tk` and removed by `cleanupE2EData` (see `cleanup.ts`) /
// `globalTeardown`.
import { runE2EDb } from "./proc";

/** Shared fixture password — satisfies the signup/login zod rule (min 8
 *  chars, ≥1 letter, ≥1 number, ≥1 special char). Must match the hash stored
 *  by `createUser` in `scripts/e2e-db.ts` so the real `/login` credentials
 *  provider can authenticate fixtures. */
export const E2E_PASSWORD = "E2eTest!1";

export type E2ERole = "USER" | "ADMIN";

export interface E2EUser {
  id: string;
  email: string;
  name: string | null;
  role: E2ERole;
}

export interface E2EStorefront {
  id: string;
  userId: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
}

export interface E2EListing {
  id: string;
  storefrontId: string;
  title: string;
  priceCents: number;
  status: string;
}

export interface E2EBundleWithItem {
  bundleId: string;
  itemId: string;
  buyerId: string;
  storefrontId: string;
}

/** Creates a namespaced `e2e+<tag>-<stamp>@test.tk` user with a real password
 *  hash (so `signIn` can authenticate it through the live `/login` form). */
export function createUser(opts?: { role?: E2ERole; emailTag?: string }): Promise<E2EUser> {
  return runE2EDb<E2EUser>("createUser", opts ?? {});
}

/** Creates a storefront owned by `userId`. `Storefront.userId` is `@unique`,
 *  so each user may own at most one — pass a fresh e2e user per call. */
export function createStorefront(
  userId: string,
  overrides?: { name?: string; slug?: string; status?: "ACTIVE" | "SUSPENDED" | "CLOSED" }
): Promise<E2EStorefront> {
  return runE2EDb<E2EStorefront>("createStorefront", userId, overrides ?? {});
}

/** Creates a `LIVE` (by default) listing under `storefrontId`, reusing
 *  existing taxonomy rows (category/condition) — never creates taxonomy. */
export function createLiveListing(
  storefrontId: string,
  overrides?: {
    title?: string;
    description?: string;
    priceCents?: number;
    status?: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "LIVE" | "SOLD" | "ARCHIVED";
    categoryId?: string;
    conditionId?: string;
    sizeId?: string;
    brandId?: string;
  }
): Promise<E2EListing> {
  return runE2EDb<E2EListing>("createLiveListing", storefrontId, overrides ?? {});
}

/** Creates an OPEN bundle with a single item — used by specs/selftests that
 *  need to exercise the FK-restrict (Bundle.buyer/storefront, BundleItem.listing)
 *  cleanup paths end-to-end. */
export function createBundleWithItem(
  buyerId: string,
  storefrontId: string,
  listingId: string
): Promise<E2EBundleWithItem> {
  return runE2EDb<E2EBundleWithItem>("createBundleWithItem", buyerId, storefrontId, listingId);
}
