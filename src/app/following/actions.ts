"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";

export type FollowResult = { following: boolean } | { error: string };

/** Toggles the current user's follow of a storefront. Gated: cannot follow a
 *  non-existent shop or one's own shop. Idempotent under a unique race (P2002). */
export async function toggleFollow(storefrontId: string): Promise<FollowResult> {
  const { userId } = await verifySession();

  const existing = await prisma.follow.findUnique({
    where: { followerId_storefrontId: { followerId: userId, storefrontId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    revalidatePath("/following");
    return { following: false };
  }

  // Gate the create path: storefront must exist and not be the user's own.
  const storefront = await prisma.storefront.findUnique({
    where: { id: storefrontId },
    select: { userId: true },
  });
  if (!storefront) return { error: "This shop is no longer available." };
  if (storefront.userId === userId) return { error: "You can't follow your own shop." };

  try {
    await prisma.follow.create({ data: { followerId: userId, storefrontId } });
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code !== "P2002") throw e; // P2002 race → already following; fall through.
  }

  revalidatePath("/following");
  return { following: true };
}
