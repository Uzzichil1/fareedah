// scripts/smoke-follows.ts
// Run with: npx tsx scripts/smoke-follows.ts
// Seeds a follower, a seller storefront, and two listings (LIVE + SOLD), then
// asserts the follow data invariants and the feed query, and cleans up.
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { followingFeedWhere } from "../src/lib/follows";
import { isFollowing, getFollowerCount, getFollowedStorefrontIds } from "../src/lib/follows-data";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("SMOKE FAIL: " + msg);
  console.log("ok - " + msg);
}

async function main() {
  const stamp = Date.now();
  const follower = await prisma.user.create({ data: { email: `smoke-follower-${stamp}@x.test` } });
  const sellerUser = await prisma.user.create({ data: { email: `smoke-fseller-${stamp}@x.test` } });
  const store = await prisma.storefront.create({
    data: { userId: sellerUser.id, name: `Follow ${stamp}`, slug: `smoke-follow-${stamp}` },
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
  const live = await mk("Follow LIVE", "LIVE");
  const sold = await mk("Follow SOLD", "SOLD");

  try {
    // follow → exists + count 1 + isFollowing true
    await prisma.follow.create({ data: { followerId: follower.id, storefrontId: store.id } });
    assert(await isFollowing(follower.id, store.id), "isFollowing true after follow");
    assert((await getFollowerCount(store.id)) === 1, "follower count is 1");
    assert((await getFollowedStorefrontIds(follower.id)).includes(store.id), "followed ids include the shop");

    // duplicate follow hits the unique constraint
    let dup = false;
    try { await prisma.follow.create({ data: { followerId: follower.id, storefrontId: store.id } }); }
    catch (e: unknown) { dup = (e as { code?: string }).code === "P2002"; }
    assert(dup, "duplicate follow hits the unique constraint (P2002)");

    // feed query returns the LIVE listing but not the SOLD one
    const ids = await getFollowedStorefrontIds(follower.id);
    const feed = await prisma.listing.findMany({ where: followingFeedWhere(ids), select: { id: true } });
    const feedIds = feed.map((l) => l.id);
    assert(feedIds.includes(live.id) && !feedIds.includes(sold.id), "feed returns LIVE only from followed shops");

    // empty follow set matches nothing
    const none = await prisma.listing.findMany({ where: followingFeedWhere([]), select: { id: true } });
    assert(none.length === 0, "empty follow set returns no listings");

    // unfollow → gone + count 0
    await prisma.follow.deleteMany({ where: { followerId: follower.id, storefrontId: store.id } });
    assert(!(await isFollowing(follower.id, store.id)), "isFollowing false after unfollow");
    assert((await getFollowerCount(store.id)) === 0, "follower count is 0 after unfollow");

    console.log("\nALL SMOKE CHECKS PASSED");
  } finally {
    await prisma.follow.deleteMany({ where: { followerId: follower.id } });
    await prisma.listing.deleteMany({ where: { storefrontId: store.id } });
    await prisma.storefront.deleteMany({ where: { slug: `smoke-follow-${stamp}` } });
    await prisma.user.deleteMany({ where: { id: { in: [follower.id, sellerUser.id] } } });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
