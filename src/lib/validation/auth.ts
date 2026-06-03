import { z } from "zod";

const password = z
  .string()
  .min(8, "Be at least 8 characters long")
  .regex(/[a-zA-Z]/, "Contain at least one letter")
  .regex(/[0-9]/, "Contain at least one number")
  .regex(/[^a-zA-Z0-9]/, "Contain at least one special character");

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").trim(),
  email: z.string().email("Please enter a valid email").trim().toLowerCase(),
  password,
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email").trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
