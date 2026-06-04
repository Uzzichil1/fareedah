import { slugify } from "@/lib/slug";
import type { PrismaClient, Brand } from "@/generated/prisma/client";

export async function findOrCreateBrand(
  db: Pick<PrismaClient, "brand">,
  rawName: string,
): Promise<Brand | null> {
  const name = rawName.trim();
  if (!name) return null;
  const slug = slugify(name);
  return db.brand.upsert({
    where: { slug },
    update: {},
    create: { name, slug },
  });
}
