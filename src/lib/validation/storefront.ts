import { z } from "zod";

export const storefrontSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
});

export type StorefrontInput = z.infer<typeof storefrontSchema>;

// Edit adds the image fields. Reuse the create rules via `.extend()` so the
// name/bio rules stay defined in exactly one place. Image URLs are optional
// and may arrive as "" (form state when no image is set).
export const storefrontEditSchema = storefrontSchema.extend({
  avatarUrl: z.string().url().optional().or(z.literal("")),
  bannerUrl: z.string().url().optional().or(z.literal("")),
});

export type StorefrontEditInput = z.infer<typeof storefrontEditSchema>;
