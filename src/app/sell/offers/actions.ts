"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSeller } from "@/lib/dal";

export type ActionResult = { error: string } | undefined;

/** Seller accepts or declines a pending offer on their own storefront's bundle. */
export async function respondToOffer(bundleId: string, accept: boolean): Promise<ActionResult> {
  const { storefrontId } = await requireSeller();
  const { count } = await prisma.bundle.updateMany({
    where: { id: bundleId, storefrontId, status: "SUBMITTED" },
    data: { status: accept ? "ACCEPTED" : "DECLINED" },
  });
  if (count === 0) return { error: "This offer is no longer pending." };
  revalidatePath("/sell/offers");
  return undefined;
}
