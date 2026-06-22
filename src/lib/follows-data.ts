import { prisma } from "@/lib/db";

/** Whether `userId` follows `storefrontId`. */
export async function isFollowing(userId: string, storefrontId: string): Promise<boolean> {
  const row = await prisma.follow.findUnique({
    where: { followerId_storefrontId: { followerId: userId, storefrontId } },
    select: { id: true },
  });
  return !!row;
}

/** Public follower count for a storefront. */
export async function getFollowerCount(storefrontId: string): Promise<number> {
  return prisma.follow.count({ where: { storefrontId } });
}

/** Ids of the storefronts `userId` follows. */
export async function getFollowedStorefrontIds(userId: string): Promise<string[]> {
  const rows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { storefrontId: true },
  });
  return rows.map((r) => r.storefrontId);
}
