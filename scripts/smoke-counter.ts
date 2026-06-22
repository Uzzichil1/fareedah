// scripts/smoke-counter.ts
// Run with: npx tsx scripts/smoke-counter.ts
// Seeds a buyer + seller storefront + 2 LIVE listings + a SUBMITTED bundle, then
// asserts the counter ping-pong + ownership guards at the data layer, and cleans up.
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { listedTotalCents, offerError } from "../src/lib/bundle";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("SMOKE FAIL: " + msg);
  console.log("ok - " + msg);
}

async function main() {
  const stamp = Date.now();
  const buyer = await prisma.user.create({ data: { email: `smoke-cbuyer-${stamp}@x.test` } });
  const sellerUser = await prisma.user.create({ data: { email: `smoke-cseller-${stamp}@x.test` } });
  const store = await prisma.storefront.create({
    data: { userId: sellerUser.id, name: `Counter ${stamp}`, slug: `smoke-counter-${stamp}` },
  });
  const otherStore = await prisma.storefront.create({
    data: { userId: buyer.id, name: `Other ${stamp}`, slug: `smoke-counter-other-${stamp}` },
  });
  const category = await prisma.category.findFirstOrThrow();
  const condition = await prisma.condition.findFirstOrThrow();
  const mk = (title: string, cents: number) =>
    prisma.listing.create({
      data: {
        storefrontId: store.id, title, description: "smoke", priceCents: cents,
        categoryId: category.id, conditionId: condition.id, status: "LIVE",
      },
    });
  const a = await mk("Counter A", 4000);
  const b = await mk("Counter B", 3000);
  const listed = listedTotalCents([
    { priceCents: 4000, isLive: true },
    { priceCents: 3000, isLive: true },
  ]);

  try {
    // offerError bound applies to counters too
    assert(offerError(listed + 1, listed) !== null, "counter above listed total rejected");
    assert(offerError(5000, listed) === null, "counter within total accepted");

    const bundle = await prisma.bundle.create({
      data: { buyerId: buyer.id, storefrontId: store.id, status: "SUBMITTED", offerCents: 5000 },
    });
    await prisma.bundleItem.createMany({
      data: [{ bundleId: bundle.id, listingId: a.id }, { bundleId: bundle.id, listingId: b.id }],
      skipDuplicates: true,
    });

    // sellerCounter: wrong storefront cannot counter
    const badCounter = await prisma.bundle.updateMany({
      where: { id: bundle.id, storefrontId: otherStore.id, status: "SUBMITTED" },
      data: { status: "COUNTERED", offerCents: 6000 },
    });
    assert(badCounter.count === 0, "sellerCounter rejects non-owning storefront");
    // correct storefront counters
    const okCounter = await prisma.bundle.updateMany({
      where: { id: bundle.id, storefrontId: store.id, status: "SUBMITTED" },
      data: { status: "COUNTERED", offerCents: 6000 },
    });
    assert(okCounter.count === 1, "sellerCounter SUBMITTED → COUNTERED");

    // buyer re-counter (submitOffer from COUNTERED): wrong buyer cannot
    const badRe = await prisma.bundle.updateMany({
      where: { id: bundle.id, buyerId: sellerUser.id, status: { in: ["OPEN", "DECLINED", "COUNTERED"] } },
      data: { status: "SUBMITTED", offerCents: 5500 },
    });
    assert(badRe.count === 0, "buyer re-counter rejects non-owner");
    const okRe = await prisma.bundle.updateMany({
      where: { id: bundle.id, buyerId: buyer.id, status: { in: ["OPEN", "DECLINED", "COUNTERED"] } },
      data: { status: "SUBMITTED", offerCents: 5500 },
    });
    assert(okRe.count === 1, "buyer re-counter COUNTERED → SUBMITTED");

    // seller counters again, buyer accepts the counter
    await prisma.bundle.updateMany({ where: { id: bundle.id, storefrontId: store.id, status: "SUBMITTED" }, data: { status: "COUNTERED", offerCents: 5800 } });
    const accept = await prisma.bundle.updateMany({
      where: { id: bundle.id, buyerId: buyer.id, status: "COUNTERED" },
      data: { status: "ACCEPTED" },
    });
    assert(accept.count === 1, "buyer acceptCounter COUNTERED → ACCEPTED");
    const finalB = await prisma.bundle.findUniqueOrThrow({ where: { id: bundle.id }, select: { status: true, offerCents: true } });
    assert(finalB.status === "ACCEPTED" && finalB.offerCents === 5800, "agreed price = seller's last counter (5800)");

    console.log("\nALL SMOKE CHECKS PASSED");
  } finally {
    await prisma.bundleItem.deleteMany({ where: { bundle: { buyerId: buyer.id } } });
    await prisma.bundle.deleteMany({ where: { buyerId: buyer.id } });
    await prisma.listing.deleteMany({ where: { storefrontId: store.id } });
    await prisma.storefront.deleteMany({ where: { slug: { in: [`smoke-counter-${stamp}`, `smoke-counter-other-${stamp}`] } } });
    await prisma.user.deleteMany({ where: { id: { in: [buyer.id, sellerUser.id] } } });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
