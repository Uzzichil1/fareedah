"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { hashPassword, verifyPassword } from "@/lib/password";
import { updateProfileSchema, changePasswordSchema } from "@/lib/validation/auth";

export type ActionResult = { error: string } | undefined;

/** Update the caller's display name. */
export async function updateProfile(raw: unknown): Promise<ActionResult> {
  const { userId } = await verifySession();
  const parsed = updateProfileSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please enter a valid name." };

  await prisma.user.update({
    where: { id: userId },
    data: { name: parsed.data.name },
  });
  revalidatePath("/account");
}

/** Change the caller's password, verifying the current one first. */
export async function changePassword(raw: unknown): Promise<ActionResult> {
  const { userId } = await verifySession();
  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    // Surface the specific failing rule(s) rather than a lumped, misleading message.
    const messages = [...new Set(parsed.error.issues.map((i) => i.message))];
    return { error: messages.join(" ") || "Please check your new password." };
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) {
    return { error: "Your account has no password set." };
  }

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return { error: "Current password is incorrect." };

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
}
