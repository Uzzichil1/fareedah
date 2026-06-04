import { z } from "zod";

export const storefrontSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
});

export type StorefrontInput = z.infer<typeof storefrontSchema>;
