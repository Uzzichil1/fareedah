import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { slugify } from "../src/lib/slug";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter });

const CONDITIONS = ["New with tags", "Excellent", "Good", "Fair"];
const CATEGORY_TREE: Record<string, string[]> = {
  Clothing: ["Tops", "Bottoms", "Dresses", "Outerwear", "Sleepwear"],
  Footwear: [],
  Accessories: [],
};
const SIZES = [
  "Preemie", "Newborn", "0-3m", "3-6m", "6-9m", "9-12m", "12-18m", "18-24m",
  "2T", "3T", "4T", "5T", "6", "7", "8",
];

async function main() {
  for (let i = 0; i < CONDITIONS.length; i++) {
    const name = CONDITIONS[i];
    const slug = slugify(name);
    await prisma.condition.upsert({
      where: { slug },
      update: { name, sortOrder: i },
      create: { name, slug, sortOrder: i },
    });
  }

  for (const [parentName, children] of Object.entries(CATEGORY_TREE)) {
    const parentSlug = slugify(parentName);
    const parent = await prisma.category.upsert({
      where: { slug: parentSlug },
      update: { name: parentName },
      create: { name: parentName, slug: parentSlug },
    });
    for (const childName of children) {
      const childSlug = slugify(childName);
      await prisma.category.upsert({
        where: { slug: childSlug },
        update: { name: childName, parentId: parent.id },
        create: { name: childName, slug: childSlug, parentId: parent.id },
      });
    }
  }

  // Global sizes (categoryId = null). The [label, categoryId] unique does not
  // dedupe when categoryId is NULL (NULLs are distinct in Postgres), so upsert
  // by a deterministic id instead to stay idempotent.
  for (let i = 0; i < SIZES.length; i++) {
    const label = SIZES[i];
    const id = `size_${slugify(label)}`;
    await prisma.size.upsert({
      where: { id },
      update: { label, sortOrder: i },
      create: { id, label, sortOrder: i },
    });
  }

  console.log("Seed complete: conditions, categories, sizes.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
