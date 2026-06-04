import { z } from "zod";

export const rejectionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Give a reason of at least 5 characters")
    .max(500),
});

export type RejectionInput = z.infer<typeof rejectionSchema>;
