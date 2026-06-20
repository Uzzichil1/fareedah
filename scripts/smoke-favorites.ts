// scripts/smoke-favorites.ts
// Run with: npx tsx scripts/smoke-favorites.ts
// Seeds a buyer + a seller storefront + two listings (one LIVE, one SOLD),
// then asserts the favourite data invariants and cleans up.
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { getFavoritedListingIds } from "../src/lib/favorites-data";
import { partitionFavorites } from "../src/lib/favorites";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("SMOKE FAIL: " + msg);
  console.log("ok - " + msg);
}

async function main() {
  const stamp = Date.now();
  const buyer = await prisma.user.create({ data: { email: `smoke-fav-buyer-${stamp}@x.test` } });
  const sellerUser = await prisma.user.create({ data: { email: `smoke-fav-seller-${stamp}@x.test` } });
  const store = await prisma.storefront.create({
    data: { userId: sellerUser.id, name: `Fav ${stamp}`, slug: `smoke-fav-${stamp}` },
  });
  const category = await prisma.category.findFirstOrThrow();
  const condition = await prisma.condition.findFirstOrThrow();
  const mk = (title: string, status: "LIVE" | "SOLD") =>
    prisma.listing.create({
      data: {
        storefrontId: store.id, title, description: "smoke", priceCents: 1000,
        categoryId: category.id, conditionId: condition.id, status,
      },
    });
  const live = await mk("Smoke LIVE", "LIVE");
  const sold = await mk("Smoke SOLD", "SOLD");

  try {
    // create → exists
    await prisma.favorite.create({ data: { userId: buyer.id, listingId: live.id } });
    let ids = await getFavoritedListingIds(buyer.id, [live.id, sold.id]);
    assert(ids.has(live.id) && !ids.has(sold.id), "getFavoritedListingIds returns only saved ids");

    // re-create is rejected by the unique index (idempotency is handled in the action's P2002 catch)
    let dup = false;
    try { await prisma.favorite.create({ data: { userId: buyer.id, listingId: live.id } }); }
    catch (e: unknown) { dup = (e as { code?: string }).code === "P2002"; }
    assert(dup, "duplicate favourite hits the unique constraint (P2002)");

    // favourite the SOLD one too, then partition
    await prisma.favorite.create({ data: { userId: buyer.id, listingId: sold.id } });
    const rows = await prisma.favorite.findMany({
      where: { userId: buyer.id },
      include: { listing: { select: { status: true } } },
      orderBy: { createdAt: "asc" },
    });
    const { available, unavailable } = partitionFavorites(rows);
    assert(available.length === 1 && available[0].listing.status === "LIVE", "available holds the LIVE favourite");
    assert(unavailable.length === 1 && unavailable[0].listing.status === "SOLD", "unavailable holds the SOLD favourite");

    // delete → gone
    await prisma.favorite.deleteMany({ where: { userId: buyer.id, listingId: live.id } });
    ids = await getFavoritedListingIds(buyer.id, [live.id]);
    assert(!ids.has(live.id), "deleted favourite no longer returned");

    console.log("\nALL SMOKE CHECKS PASSED");
  } finally {
    await prisma.favorite.deleteMany({ where: { userId: buyer.id } });
    await prisma.listing.deleteMany({ where: { storefrontId: store.id } });
    await prisma.storefront.deleteMany({ where: { slug: `smoke-fav-${stamp}` } });
    await prisma.user.deleteMany({ where: { id: { in: [buyer.id, sellerUser.id] } } });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
