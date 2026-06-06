// Run with: npx tsx scripts/smoke-bundle.ts
// Seeds a buyer, a seller storefront, and two LIVE listings, then asserts the
// core 4a invariants at the data layer, and cleans up.
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { listedTotalCents, offerError } from "../src/lib/bundle";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("SMOKE FAIL: " + msg);
  console.log("ok - " + msg);
}

async function main() {
  const stamp = Date.now();
  const buyer = await prisma.user.create({ data: { email: `smoke-buyer-${stamp}@x.test` } });
  const sellerUser = await prisma.user.create({ data: { email: `smoke-seller-${stamp}@x.test` } });
  const store = await prisma.storefront.create({
    data: { userId: sellerUser.id, name: `Smoke ${stamp}`, slug: `smoke-${stamp}` },
  });
  // Minimal taxonomy refs — reuse any existing Category/Condition.
  const category = await prisma.category.findFirstOrThrow();
  const condition = await prisma.condition.findFirstOrThrow();
  const mk = (title: string, cents: number) =>
    prisma.listing.create({
      data: {
        storefrontId: store.id, title, description: "smoke", priceCents: cents,
        categoryId: category.id, conditionId: condition.id, status: "LIVE",
      },
    });
  const a = await mk("Smoke A", 3400);
  const b = await mk("Smoke B", 2800);

  try {
    // listedTotalCents only counts LIVE
    assert(listedTotalCents([{ priceCents: 3400, isLive: true }, { priceCents: 2800, isLive: false }]) === 3400, "live total excludes non-live");
    // offerError bounds
    assert(offerError(7000, 6200) !== null, "offer over total rejected");
    assert(offerError(5000, 6200) === null, "valid offer accepted");

    // Find-or-create OPEN bundle + add both items
    const bundle = await prisma.bundle.create({ data: { buyerId: buyer.id, storefrontId: store.id, status: "OPEN" } });
    await prisma.bundleItem.createMany({ data: [{ bundleId: bundle.id, listingId: a.id }, { bundleId: bundle.id, listingId: b.id }], skipDuplicates: true });
    // re-add is a no-op (no throw)
    await prisma.bundleItem.createMany({ data: [{ bundleId: bundle.id, listingId: a.id }], skipDuplicates: true });
    const count = await prisma.bundleItem.count({ where: { bundleId: bundle.id } });
    assert(count === 2, "re-add is idempotent (2 items)");

    // submitOffer guard: wrong owner cannot transition
    const wrong = await prisma.bundle.updateMany({ where: { id: bundle.id, buyerId: sellerUser.id, status: { in: ["OPEN", "DECLINED"] } }, data: { status: "SUBMITTED", offerCents: 5000 } });
    assert(wrong.count === 0, "submitOffer rejects non-owner (count 0)");
    // correct owner transitions
    const ok = await prisma.bundle.updateMany({ where: { id: bundle.id, buyerId: buyer.id, status: { in: ["OPEN", "DECLINED"] } }, data: { status: "SUBMITTED", offerCents: 5000 } });
    assert(ok.count === 1, "submitOffer succeeds for owner");

    // respondToOffer guard: wrong storefront cannot accept
    const otherStore = await prisma.storefront.create({ data: { userId: buyer.id, name: `Other ${stamp}`, slug: `other-${stamp}` } });
    const badAccept = await prisma.bundle.updateMany({ where: { id: bundle.id, storefrontId: otherStore.id, status: "SUBMITTED" }, data: { status: "ACCEPTED" } });
    assert(badAccept.count === 0, "respondToOffer rejects non-owning seller");
    const goodAccept = await prisma.bundle.updateMany({ where: { id: bundle.id, storefrontId: store.id, status: "SUBMITTED" }, data: { status: "ACCEPTED" } });
    assert(goodAccept.count === 1, "respondToOffer succeeds for owning seller");

    console.log("\nALL SMOKE CHECKS PASSED");
  } finally {
    // cleanup (order respects FKs)
    await prisma.bundleItem.deleteMany({ where: { bundle: { buyerId: { in: [buyer.id] } } } });
    await prisma.bundle.deleteMany({ where: { buyerId: buyer.id } });
    await prisma.listing.deleteMany({ where: { storefrontId: store.id } });
    await prisma.storefront.deleteMany({ where: { slug: { in: [`smoke-${stamp}`, `other-${stamp}`] } } });
    await prisma.user.deleteMany({ where: { id: { in: [buyer.id, sellerUser.id] } } });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
