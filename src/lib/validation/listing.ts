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

/** Strict — submitting for review. Messages are user-facing (surfaced on submit). */
export const listingSubmitSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120, "Title must be 120 characters or fewer"),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(2000, "Description must be 2000 characters or fewer"),
  priceCents: z.number().int().positive("Set a price above $0"),
  categoryId: z.string().min(1, "Pick a category"),
  conditionId: z.string().min(1, "Pick a condition"),
  sizeId: z.string().optional(),
  images: z.array(listingImageSchema).min(1, "Add at least one image").max(8, "Up to 8 images"),
});

export type ListingDraftInput = z.infer<typeof listingDraftSchema>;
