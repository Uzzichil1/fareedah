"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { rejectionSchema } from "@/lib/validation/curation";

export type ActionResult = { error: string } | undefined;

const NOT_PENDING = "This listing is no longer awaiting review.";

export async function approveListing(id: string): Promise<ActionResult> {
  await requireAdmin();
  const { count } = await prisma.listing.updateMany({
    where: { id, status: "PENDING_REVIEW" },
    data: { status: "LIVE", rejectionReason: null },
  });
  if (count === 0) return { error: NOT_PENDING };
  revalidatePath("/admin");
  return undefined;
}

export async function rejectListing(id: string, rawReason: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = rejectionSchema.safeParse({ reason: rawReason });
  if (!parsed.success) {
    return { error: "Please give a reason of at least 5 characters." };
  }
  const { count } = await prisma.listing.updateMany({
    where: { id, status: "PENDING_REVIEW" },
    data: { status: "REJECTED", rejectionReason: parsed.data.reason },
  });
  if (count === 0) return { error: NOT_PENDING };
  revalidatePath("/admin");
  return undefined;
}
