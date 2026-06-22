"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { dollarsToCents } from "@/lib/money";
import { listedTotalCents, offerError } from "@/lib/bundle";

export type ActionResult = { error: string } | undefined;

const EDITABLE = ["OPEN", "DECLINED"] as const;
const OFFERABLE = ["OPEN", "DECLINED", "COUNTERED"] as const;

/** Add a LIVE listing to the buyer's OPEN bundle for that seller (find-or-create). */
export async function addToBundle(listingId: string): Promise<ActionResult> {
  const { userId } = await verifySession();

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      status: true,
      storefrontId: true,
      storefront: { select: { userId: true } },
    },
  });
  if (!listing || listing.status !== "LIVE") {
    return { error: "This item is no longer available." };
  }
  if (listing.storefront.userId === userId) {
    return { error: "You can't add your own item." };
  }

  // Reuse the buyer's editable bundle for this seller. Prefer an existing OPEN
  // cart; otherwise revive a DECLINED one to OPEN (matches the state machine in
  // src/lib/bundle.ts: addItem from OPEN|DECLINED -> OPEN). The partial unique
  // index guarantees at most one OPEN per (buyer, seller).
  let bundle = await prisma.bundle.findFirst({
    where: { buyerId: userId, storefrontId: listing.storefrontId, status: "OPEN" },
    select: { id: true },
  });
  if (!bundle) {
    const declined = await prisma.bundle.findFirst({
      where: { buyerId: userId, storefrontId: listing.storefrontId, status: "DECLINED" },
      select: { id: true },
    });
    if (declined) {
      await prisma.bundle.update({
        where: { id: declined.id },
        data: { status: "OPEN", offerCents: null },
      });
      bundle = declined;
    }
  }
  if (!bundle) {
    try {
      bundle = await prisma.bundle.create({
        data: { buyerId: userId, storefrontId: listing.storefrontId, status: "OPEN" },
        select: { id: true },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      bundle = await prisma.bundle.findFirstOrThrow({
        where: { buyerId: userId, storefrontId: listing.storefrontId, status: "OPEN" },
        select: { id: true },
      });
    }
  }

  // skipDuplicates makes a re-add (double-click) a no-op instead of a P2002 500.
  await prisma.bundleItem.createMany({
    data: [{ bundleId: bundle.id, listingId }],
    skipDuplicates: true,
  });

  revalidatePath("/bag");
  return undefined;
}

/** Remove one item from an editable bundle; delete the bundle if it becomes empty. */
export async function removeFromBundle(bundleId: string, listingId: string): Promise<ActionResult> {
  const { userId } = await verifySession();

  const bundle = await prisma.bundle.findFirst({
    where: { id: bundleId, buyerId: userId, status: { in: [...EDITABLE] } },
    select: { id: true },
  });
  if (!bundle) return { error: "This bag can't be edited." };

  await prisma.bundleItem.deleteMany({ where: { bundleId, listingId } });

  const remaining = await prisma.bundleItem.count({ where: { bundleId } });
  if (remaining === 0) {
    await prisma.bundle.delete({ where: { id: bundleId } });
  } else {
    await prisma.bundle.update({
      where: { id: bundleId },
      data: { status: "OPEN", offerCents: null },
    });
  }

  revalidatePath("/bag");
  return undefined;
}

/** Delete an editable bundle entirely. */
export async function clearBundle(bundleId: string): Promise<ActionResult> {
  const { userId } = await verifySession();
  const { count } = await prisma.bundle.deleteMany({
    where: { id: bundleId, buyerId: userId, status: { in: [...EDITABLE] } },
  });
  if (count === 0) return { error: "This bag can't be cleared." };
  revalidatePath("/bag");
  return undefined;
}

/** Submit a proposed total (dollars) on an editable bundle → SUBMITTED. */
export async function submitOffer(bundleId: string, offerDollars: string): Promise<ActionResult> {
  const { userId } = await verifySession();

  const offerCents = dollarsToCents(offerDollars);
  if (offerCents === null) return { error: "Enter a valid amount." };

  const bundle = await prisma.bundle.findFirst({
    where: { id: bundleId, buyerId: userId, status: { in: [...OFFERABLE] } },
    select: {
      items: { select: { listing: { select: { priceCents: true, status: true } } } },
    },
  });
  if (!bundle) return { error: "This bag can't receive an offer." };

  const listed = listedTotalCents(
    bundle.items.map((i) => ({ priceCents: i.listing.priceCents, isLive: i.listing.status === "LIVE" })),
  );
  const err = offerError(offerCents, listed);
  if (err) return { error: err };

  // Atomic guard: only transitions if still owned + still offerable.
  const { count } = await prisma.bundle.updateMany({
    where: { id: bundleId, buyerId: userId, status: { in: [...OFFERABLE] } },
    data: { status: "SUBMITTED", offerCents },
  });
  if (count === 0) return { error: "This bag can't receive an offer." };

  revalidatePath("/bag");
  return undefined;
}

/** Withdraw a pending offer → OPEN. */
export async function withdrawOffer(bundleId: string): Promise<ActionResult> {
  const { userId } = await verifySession();
  const { count } = await prisma.bundle.updateMany({
    where: { id: bundleId, buyerId: userId, status: "SUBMITTED" },
    data: { status: "OPEN", offerCents: null },
  });
  if (count === 0) return { error: "No pending offer to withdraw." };
  revalidatePath("/bag");
  return undefined;
}

/** Buyer accepts the seller's counter → ACCEPTED (offerCents stays = agreed counter). */
export async function acceptCounter(bundleId: string): Promise<ActionResult> {
  const { userId } = await verifySession();
  const { count } = await prisma.bundle.updateMany({
    where: { id: bundleId, buyerId: userId, status: "COUNTERED" },
    data: { status: "ACCEPTED" },
  });
  if (count === 0) return { error: "This counter is no longer available." };
  revalidatePath("/bag");
  return undefined;
}

/** Buyer declines the seller's counter → DECLINED. */
export async function declineCounter(bundleId: string): Promise<ActionResult> {
  const { userId } = await verifySession();
  const { count } = await prisma.bundle.updateMany({
    where: { id: bundleId, buyerId: userId, status: "COUNTERED" },
    data: { status: "DECLINED" },
  });
  if (count === 0) return { error: "This counter is no longer available." };
  revalidatePath("/bag");
  return undefined;
}
