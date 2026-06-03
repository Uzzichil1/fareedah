"use server";

import { AuthError } from "next-auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { signIn, signOut } from "@/auth";
import { signupSchema, loginSchema } from "@/lib/validation/auth";

export type ActionResult = { error: string } | undefined;

export async function signupAction(raw: unknown): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Please check your details and try again." };
  }
  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({ data: { name, email, passwordHash } });

  // On success this throws a redirect, which must propagate; only an
  // AuthError (unexpected, since we just created+validated the user) is caught.
  try {
    await signIn("credentials", { email, password, redirectTo: "/account" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created, but automatic sign-in failed. Please log in." };
    }
    throw error;
  }
}

export async function loginAction(raw: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Invalid email or password." };
  }
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/account",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error; // re-throw the redirect (and anything non-auth)
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
