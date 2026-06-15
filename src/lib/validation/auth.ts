import { z } from "zod";

export const password = z
  .string()
  .min(8, "Be at least 8 characters long")
  .regex(/[a-zA-Z]/, "Contain at least one letter")
  .regex(/[0-9]/, "Contain at least one number")
  .regex(/[^a-zA-Z0-9]/, "Contain at least one special character");

const name = z.string().trim().min(2, "Name must be at least 2 characters");

export const signupSchema = z.object({
  name: name.max(60),
  email: z.string().email("Please enter a valid email").trim().toLowerCase(),
  password,
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email").trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z.object({
  name: name.max(60),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: password,
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
