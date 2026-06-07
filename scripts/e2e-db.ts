// e2e-db.ts — single source of truth for all E2E-fixture Prisma operations.
//
// WHY THIS FILE EXISTS (architecture note for whoever reads this next):
// Playwright's test runner transforms spec/support files through Babel to
// CommonJS (no `"type": "module"` in package.json). Prisma 7's generated
// client (`src/generated/prisma/client.ts`) is ESM-only — it references
// `import.meta.url` at module scope — and crashes ("exports is not defined
// in ES module scope") the instant Babel compiles it to CJS. That happens
// transitively for ANY file Playwright loads that imports `src/lib/db`,
// regardless of whether the import path is relative or aliased.
//
// `tsx` (used successfully by `scripts/smoke-bundle.ts` and `prisma/seed.ts`)
// has a proper ESM-aware loader and does not hit this problem. So: all actual
// Prisma calls for E2E fixtures live HERE, executed via `tsx` in a child
// process (see `e2e/support/proc.ts`). The Playwright-loaded support files
// (`e2e/support/factories.ts`, `cleanup.ts`) are thin subprocess wrappers that
// import nothing Prisma-related, so they load cleanly under the runner.
//
// Run with: npx tsx scripts/e2e-db.ts <command> [jsonArgs]
// Prints exactly ONE line of JSON (the result) to stdout as the LAST line —
// callers must parse the last non-empty line (Prisma's `log: ["error","warn"]`
// can also write to stdout/stderr, so don't assume stdout is JSON-only).
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import type { Role } from "../src/generated/prisma/client";

/** Shared fixture password — satisfies the signup/login zod rule (min 8,
 *  ≥1 letter, ≥1 number, ≥1 special char). 9 chars. */
export const E2E_PASSWORD = "E2eTest!1";

const EMAIL_NAMESPACE = { startsWith: "e2e+", endsWith: "@test.tk" } as const;
/** Relation filter reused everywhere an `<e2e user>` predicate is needed. */
const E2E_USER = { email: EMAIL_NAMESPACE } as const;

function stamp() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Factories — each takes a JSON-serializable options object and returns a
// JSON-serializable row (or rows). Keep return shapes flat and primitive.
// ---------------------------------------------------------------------------

export async function createUser(opts?: { role?: Role; emailTag?: string }) {
  const tag = opts?.emailTag ? `${opts.emailTag}-` : "";
  const email = `e2e+${tag}${stamp()}@test.tk`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `E2E ${opts?.role ?? "USER"} ${tag}`.trim(),
      role: opts?.role ?? "USER",
      passwordHash: await hashPassword(E2E_PASSWORD),
      emailVerified: new Date(),
    },
  });
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function createStorefront(
  userId: string,
  overrides?: { name?: string; slug?: string; status?: "ACTIVE" | "SUSPENDED" | "CLOSED" }
) {
  const s = stamp();
  const store = await prisma.storefront.create({
    data: {
      userId,
      name: overrides?.name ?? `E2E Storefront ${s}`,
      slug: overrides?.slug ?? `e2e-store-${s}`,
      status: overrides?.status ?? "ACTIVE",
    },
  });
  return { id: store.id, userId: store.userId, name: store.name, slug: store.slug, status: store.status };
}

export async function createLiveListing(
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
) {
  const s = stamp();
  // Reuse existing taxonomy rows — do NOT create taxonomy (mirrors smoke-bundle).
  const category = overrides?.categoryId
    ? { id: overrides.categoryId }
    : await prisma.category.findFirstOrThrow();
  const condition = overrides?.conditionId
    ? { id: overrides.conditionId }
    : await prisma.condition.findFirstOrThrow();

  const listing = await prisma.listing.create({
    data: {
      storefrontId,
      title: overrides?.title ?? `E2E Listing ${s}`,
      description: overrides?.description ?? "Created by the E2E data-isolation layer.",
      priceCents: overrides?.priceCents ?? 1999,
      categoryId: category.id,
      conditionId: condition.id,
      sizeId: overrides?.sizeId,
      brandId: overrides?.brandId,
      status: overrides?.status ?? "LIVE",
    },
  });
  return {
    id: listing.id,
    storefrontId: listing.storefrontId,
    title: listing.title,
    priceCents: listing.priceCents,
    status: listing.status,
  };
}

/** Convenience: create a bundle (+ one item) for selftest/spec scenarios that
 *  need to exercise the FK-restrict cleanup paths. Not in the original B2
 *  helper list, but the selftest acceptance criteria requires a bundle+item
 *  to exist pre-cleanup, so it's exposed here rather than inlined ad hoc. */
export async function createBundleWithItem(buyerId: string, storefrontId: string, listingId: string) {
  const bundle = await prisma.bundle.create({
    data: { buyerId, storefrontId, status: "OPEN" },
  });
  const item = await prisma.bundleItem.create({
    data: { bundleId: bundle.id, listingId },
  });
  return { bundleId: bundle.id, itemId: item.id, buyerId, storefrontId };
}

// ---------------------------------------------------------------------------
// Cleanup — FK-safe deletion of every `e2e+*@test.tk` fixture row.
//
// FK cascade reality (verified against prisma/schema.prisma):
//   - BundleItem.bundle -> Cascade, but Bundle.buyer / Bundle.storefront /
//     BundleItem.listing are RESTRICT (no onDelete). So deleting a User does
//     NOT cascade through Bundles — bundles/items must be deleted explicitly,
//     first, in FK order.
//   - Storefront.user, Listing.storefront, ListingImage.listing, Account.user
//     are Cascade.
// Order (mirrors scripts/smoke-bundle.ts, generalized to the e2e namespace):
//   1. bundleItem  — where bundle.buyer is e2e OR listing.storefront.user is e2e
//   2. bundle      — where buyer is e2e OR storefront.user is e2e
//   3. listing     — where storefront.user is e2e   (cascades ListingImage)
//   4. storefront  — where user is e2e
//   5. user        — where email startsWith "e2e+" AND endsWith "@test.tk"
//                    (cascades Account)
// Workstream B does not create Order/OrderItem/Conversation/Message/Favorite
// rows, so they are intentionally out of scope here.
// ---------------------------------------------------------------------------

export async function cleanupE2EData() {
  const bundleItems = await prisma.bundleItem.deleteMany({
    where: {
      OR: [
        { bundle: { buyer: E2E_USER } },
        { listing: { storefront: { user: E2E_USER } } },
      ],
    },
  });
  const bundles = await prisma.bundle.deleteMany({
    where: { OR: [{ buyer: E2E_USER }, { storefront: { user: E2E_USER } }] },
  });
  const listings = await prisma.listing.deleteMany({
    where: { storefront: { user: E2E_USER } },
  });
  const storefronts = await prisma.storefront.deleteMany({
    where: { user: E2E_USER },
  });
  const users = await prisma.user.deleteMany({
    where: { email: EMAIL_NAMESPACE },
  });

  return {
    bundleItems: bundleItems.count,
    bundles: bundles.count,
    listings: listings.count,
    storefronts: storefronts.count,
    users: users.count,
  };
}

/** Counts e2e rows by the SAME predicates cleanup deletes by — used by the
 *  selftest to prove zero residue against the exact surface that was deleted
 *  (a narrower count predicate could pass while residue remains). */
export async function countE2EData() {
  const [bundleItems, bundles, listings, storefronts, users] = await Promise.all([
    prisma.bundleItem.count({
      where: {
        OR: [
          { bundle: { buyer: E2E_USER } },
          { listing: { storefront: { user: E2E_USER } } },
        ],
      },
    }),
    prisma.bundle.count({ where: { OR: [{ buyer: E2E_USER }, { storefront: { user: E2E_USER } }] } }),
    prisma.listing.count({ where: { storefront: { user: E2E_USER } } }),
    prisma.storefront.count({ where: { user: E2E_USER } }),
    prisma.user.count({ where: { email: EMAIL_NAMESPACE } }),
  ]);
  return { bundleItems, bundles, listings, storefronts, users };
}

// ---------------------------------------------------------------------------
// CLI dispatch — `npx tsx scripts/e2e-db.ts <command> [jsonArgs]`
// Prints the JSON result as the last stdout line, then exits.
// ---------------------------------------------------------------------------

async function dispatch(name: string, rawArgs: unknown[]): Promise<unknown> {
  switch (name) {
    case "createUser":
      return createUser(rawArgs[0] as Parameters<typeof createUser>[0]);
    case "createStorefront":
      return createStorefront(rawArgs[0] as string, rawArgs[1] as Parameters<typeof createStorefront>[1]);
    case "createLiveListing":
      return createLiveListing(rawArgs[0] as string, rawArgs[1] as Parameters<typeof createLiveListing>[1]);
    case "createBundleWithItem":
      return createBundleWithItem(rawArgs[0] as string, rawArgs[1] as string, rawArgs[2] as string);
    case "cleanup":
      return cleanupE2EData();
    case "count":
      return countE2EData();
    default:
      throw new Error(`e2e-db: unknown command "${name}"`);
  }
}

async function main() {
  const [, , name, argsJson] = process.argv;
  if (!name) throw new Error("e2e-db: missing command");
  const args = argsJson ? (JSON.parse(argsJson) as unknown[]) : [];
  const result = await dispatch(name, args);
  // The marker makes the "last JSON line" contract explicit and easy to find
  // even if Prisma logs warnings/errors around it.
  console.log("__E2E_DB_RESULT__" + JSON.stringify(result));
}

// Only run the CLI when executed directly (so the selftest / e2e:clean can
// also `import { cleanupE2EData, countE2EData, ... }` in-process under tsx).
const isMain = process.argv[1] && process.argv[1].endsWith("e2e-db.ts");
if (isMain) {
  main()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
