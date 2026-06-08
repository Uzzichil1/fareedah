// Run with: npx tsx scripts/e2e-clean.ts   (or `npm run e2e:clean`)
//
// Standalone "kill stray fixtures" script. Mitigates residue left behind by
// killed/crashed E2E runs (where `globalTeardown` never got to run): deletes
// every `e2e+...@test.tk` row across users/storefronts/listings/bundles/
// bundleItems, in FK-safe order, and reports the per-table counts.
//
// Runs under `tsx` (not Playwright), so — unlike `e2e/support/*` — it can
// import `cleanupE2EData` directly and in-process; no subprocess needed. See
// the architecture note atop `scripts/e2e-db.ts` for why that split exists.
import { cleanupE2EData } from "./e2e-db";
import { prisma } from "../src/lib/db";

async function main() {
  const counts = await cleanupE2EData();
  const total = counts.users + counts.storefronts + counts.listings + counts.bundles + counts.bundleItems;
  console.log("[e2e:clean] removed e2e+ fixtures:");
  console.log(`  users        = ${counts.users}`);
  console.log(`  storefronts  = ${counts.storefronts}`);
  console.log(`  listings     = ${counts.listings}`);
  console.log(`  bundles      = ${counts.bundles}`);
  console.log(`  bundleItems  = ${counts.bundleItems}`);
  console.log(total === 0 ? "[e2e:clean] DB was already clean — 0 stray rows." : `[e2e:clean] removed ${total} stray row(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
