import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/authz";
import type { Role } from "@/generated/prisma/client";

type SessionInfo = { userId: string; role: Role };

/** Returns the session or redirects to /login. Memoized per request. */
export const verifySession = cache(async (): Promise<SessionInfo> => {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return { userId: session.user.id, role: session.user.role };
});

/** Returns the current user's safe fields, or null. */
export const getCurrentUser = cache(async () => {
  const { userId } = await verifySession();
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, image: true, role: true },
  });
});

/** Asserts the current user is an admin; redirects home otherwise. */
export async function requireAdmin(): Promise<SessionInfo> {
  const session = await verifySession();
  if (!isAdmin(session.role)) {
    redirect("/");
  }
  return session;
}

/** Asserts the current user owns a storefront (is a seller). */
export async function requireSeller(): Promise<{ userId: string; storefrontId: string }> {
  const { userId } = await verifySession();
  const storefront = await prisma.storefront.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!storefront) {
    redirect("/sell/start");
  }
  return { userId, storefrontId: storefront.id };
}
