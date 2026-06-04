"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { slugify, uniqueSlug } from "@/lib/slug";
import { storefrontSchema } from "@/lib/validation/storefront";

export type ActionResult = { error: string } | undefined;

export async function createStorefront(raw: unknown): Promise<ActionResult> {
  const { userId } = await verifySession();
  const parsed = storefrontSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check your details." };

  const existing = await prisma.storefront.findUnique({ where: { userId } });
  if (existing) redirect("/sell");

  const base = slugify(parsed.data.name);
  const slug = await uniqueSlug(
    base,
    async (s) => !!(await prisma.storefront.findUnique({ where: { slug: s } })),
  );

  await prisma.storefront.create({
    data: {
      userId,
      name: parsed.data.name,
      slug,
      bio: parsed.data.bio ? parsed.data.bio : null,
    },
  });
  redirect("/sell");
}
