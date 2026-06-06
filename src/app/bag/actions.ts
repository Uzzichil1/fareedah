"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { dollarsToCents } from "@/lib/money";
import { listedTotalCents, offerError } from "@/lib/bundle";

export type ActionResult = { error: string } | undefined;

const EDITABLE = ["OPEN", "DECLINED"] as const;

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

  // Find-or-create the OPEN bundle. The partial unique index (Task 1) makes the
  // race safe: a losing concurrent create throws, and we re-read the winner.
  let bundle = await prisma.bundle.findFirst({
    where: { buyerId: userId, storefrontId: listing.storefrontId, status: "OPEN" },
    select: { id: true },
  });
  if (!bundle) {
    try {
      bundle = await prisma.bundle.create({
        data: { buyerId: userId, storefrontId: listing.storefrontId, status: "OPEN" },
        select: { id: true },
      });
    } catch {
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
    where: { id: bundleId, buyerId: userId, status: { in: [...EDITABLE] } },
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

  // Atomic guard: only transitions if still owned + still editable.
  const { count } = await prisma.bundle.updateMany({
    where: { id: bundleId, buyerId: userId, status: { in: [...EDITABLE] } },
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
