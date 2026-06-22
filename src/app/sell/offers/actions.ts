"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSeller } from "@/lib/dal";
import { dollarsToCents } from "@/lib/money";
import { listedTotalCents, offerError } from "@/lib/bundle";

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

/** Seller proposes a counter price on a pending (SUBMITTED) offer for their own
 *  storefront's bundle → COUNTERED. */
export async function counterOffer(bundleId: string, counterDollars: string): Promise<ActionResult> {
  const { storefrontId } = await requireSeller();

  const counterCents = dollarsToCents(counterDollars);
  if (counterCents === null) return { error: "Enter a valid amount." };

  const bundle = await prisma.bundle.findFirst({
    where: { id: bundleId, storefrontId, status: "SUBMITTED" },
    select: {
      items: { select: { listing: { select: { priceCents: true, status: true } } } },
    },
  });
  if (!bundle) return { error: "This offer is no longer pending." };

  const listed = listedTotalCents(
    bundle.items.map((i) => ({ priceCents: i.listing.priceCents, isLive: i.listing.status === "LIVE" })),
  );
  const err = offerError(counterCents, listed);
  if (err) return { error: err };

  const { count } = await prisma.bundle.updateMany({
    where: { id: bundleId, storefrontId, status: "SUBMITTED" },
    data: { status: "COUNTERED", offerCents: counterCents },
  });
  if (count === 0) return { error: "This offer is no longer pending." };

  revalidatePath("/sell/offers");
  return undefined;
}
