import { z } from "zod";

export const listingImageSchema = z.object({
  url: z.string().url(),
  publicId: z.string().optional(),
  position: z.number().int().min(0),
});

/** Lenient — saving a draft. category + condition are required (non-null FKs). */
export const listingDraftSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  categoryId: z.string().min(1, "Pick a category"),
  conditionId: z.string().min(1, "Pick a condition"),
  description: z.string().trim().max(2000).optional().default(""),
  priceDollars: z.string().trim().optional().default(""),
  sizeId: z.string().optional().default(""),
  brand: z.string().trim().max(60).optional().default(""),
  images: z.array(listingImageSchema).max(8).optional().default([]),
});

/** Strict — submitting for review. */
export const listingSubmitSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  priceCents: z.number().int().positive(),
  categoryId: z.string().min(1),
  conditionId: z.string().min(1),
  sizeId: z.string().optional(),
  images: z.array(listingImageSchema).min(1, "At least one image is required").max(8),
});

export type ListingDraftInput = z.infer<typeof listingDraftSchema>;
