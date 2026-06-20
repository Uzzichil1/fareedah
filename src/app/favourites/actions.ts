"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";

export type ToggleResult = { favorited: boolean } | { error: string };

/** Toggles the current user's favourite for a listing. Idempotent under a
 *  unique-constraint race (P2002 on create → treated as already favourited). */
export async function toggleFavorite(listingId: string): Promise<ToggleResult> {
  const { userId } = await verifySession();

  const existing = await prisma.favorite.findUnique({
    where: { userId_listingId: { userId, listingId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    revalidatePath("/favourites");
    return { favorited: false };
  }

  try {
    await prisma.favorite.create({ data: { userId, listingId } });
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code === "P2002") {
      // Concurrent create won the race — already favourited.
      revalidatePath("/favourites");
      return { favorited: true };
    }
    if (code === "P2003") {
      // FK violation — the listing no longer exists.
      return { error: "This item is no longer available." };
    }
    throw e;
  }

  revalidatePath("/favourites");
  return { favorited: true };
}
