import { prisma } from "@/lib/db";

/** Returns the subset of `listingIds` the user has favourited, as a Set.
 *  One query; short-circuits on an empty input. */
export async function getFavoritedListingIds(
  userId: string,
  listingIds: string[],
): Promise<Set<string>> {
  if (listingIds.length === 0) return new Set();
  const rows = await prisma.favorite.findMany({
    where: { userId, listingId: { in: listingIds } },
    select: { listingId: true },
  });
  return new Set(rows.map((r) => r.listingId));
}
