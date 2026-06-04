"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifySession, requireSeller } from "@/lib/dal";
import { dollarsToCents } from "@/lib/money";
import { findOrCreateBrand } from "@/lib/brands";
import { buildUploadSignature } from "@/lib/cloudinary";
import {
  listingDraftSchema,
  listingSubmitSchema,
  type ListingDraftInput,
} from "@/lib/validation/listing";
import { slugify, uniqueSlug } from "@/lib/slug";
import { storefrontSchema } from "@/lib/validation/storefront";

export type ActionResult = { error: string } | undefined;

export async function createStorefront(raw: unknown): Promise<ActionResult> {
  const { userId } = await verifySession();
  const parsed = storefrontSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check your details." };

  const existing = await prisma.storefront.findUnique({ where: { userId } });
  if (existing) redirect("/sell");

  const base = slugify(parsed.data.name);
  const slug = await uniqueSlug(
    base,
    async (s) => !!(await prisma.storefront.findUnique({ where: { slug: s } })),
  );

  await prisma.storefront.create({
    data: {
      userId,
      name: parsed.data.name,
      slug,
      bio: parsed.data.bio ? parsed.data.bio : null,
    },
  });
  redirect("/sell");
}

export type UploadSignature = {
  timestamp: number;
  folder: string;
  signature: string;
  apiKey: string;
  cloudName: string;
};

export async function createUploadSignature(): Promise<UploadSignature> {
  await requireSeller();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "tinykloset/listings";
  const signature = buildUploadSignature(
    { folder, timestamp },
    process.env.CLOUDINARY_API_SECRET ?? "",
  );
  return {
    timestamp,
    folder,
    signature,
    apiKey: process.env.CLOUDINARY_API_KEY ?? "",
    cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "",
  };
}

async function persistImages(listingId: string, images: ListingDraftInput["images"]) {
  await prisma.$transaction([
    prisma.listingImage.deleteMany({ where: { listingId } }),
    ...(images.length > 0
      ? [
          prisma.listingImage.createMany({
            data: images.map((img, i) => ({
              listingId,
              url: img.url,
              publicId: img.publicId ?? null,
              position: img.position ?? i,
            })),
          }),
        ]
      : []),
  ]);
}

/** Create a DRAFT listing. Returns the new id or an error. */
export async function createListing(
  raw: unknown,
): Promise<{ id: string } | { error: string }> {
  const { storefrontId } = await requireSeller();
  const parsed = listingDraftSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the listing details." };
  const d = parsed.data;
  const priceCents = d.priceDollars ? dollarsToCents(d.priceDollars) ?? 0 : 0;
  const brand = d.brand ? await findOrCreateBrand(prisma, d.brand) : null;

  const listing = await prisma.listing.create({
    data: {
      storefrontId,
      title: d.title,
      description: d.description,
      priceCents,
      categoryId: d.categoryId,
      conditionId: d.conditionId,
      sizeId: d.sizeId || null,
      brandId: brand?.id ?? null,
      status: "DRAFT",
    },
  });
  await persistImages(listing.id, d.images);
  return { id: listing.id };
}

async function ownedEditableListing(id: string, storefrontId: string) {
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing || listing.storefrontId !== storefrontId) return null;
  if (listing.status !== "DRAFT" && listing.status !== "REJECTED") return null;
  return listing;
}

/** Update an owned DRAFT/REJECTED listing. */
export async function updateListing(
  id: string,
  raw: unknown,
): Promise<ActionResult> {
  const { storefrontId } = await requireSeller();
  if (!(await ownedEditableListing(id, storefrontId))) return { error: "This listing can't be edited." };
  const parsed = listingDraftSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the listing details." };
  const d = parsed.data;
  const priceCents = d.priceDollars ? dollarsToCents(d.priceDollars) ?? 0 : 0;
  const brand = d.brand ? await findOrCreateBrand(prisma, d.brand) : null;

  await prisma.listing.update({
    where: { id },
    data: {
      title: d.title,
      description: d.description,
      priceCents,
      categoryId: d.categoryId,
      conditionId: d.conditionId,
      sizeId: d.sizeId || null,
      brandId: brand?.id ?? null,
    },
  });
  await persistImages(id, d.images);
  return undefined;
}

/** Validate the persisted listing strictly and move it to PENDING_REVIEW. */
export async function submitListing(id: string): Promise<ActionResult> {
  const { storefrontId } = await requireSeller();
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { images: true },
  });
  if (!listing || listing.storefrontId !== storefrontId) return { error: "Not found." };
  if (listing.status !== "DRAFT" && listing.status !== "REJECTED") {
    return { error: "This listing can't be submitted." };
  }
  const check = listingSubmitSchema.safeParse({
    title: listing.title,
    description: listing.description,
    priceCents: listing.priceCents,
    categoryId: listing.categoryId,
    conditionId: listing.conditionId,
    sizeId: listing.sizeId ?? undefined,
    images: listing.images.map((i) => ({ url: i.url, publicId: i.publicId ?? undefined, position: i.position })),
  });
  if (!check.success) {
    return { error: "Add a description, a price above $0, and at least one image before submitting." };
  }
  await prisma.listing.update({ where: { id }, data: { status: "PENDING_REVIEW" } });
  redirect("/sell");
}
