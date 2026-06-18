import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { slugify } from "../src/lib/slug";
import { findOrCreateBrand } from "../src/lib/brands";

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

// ---------------------------------------------------------------------------
// Demo seed data (gated behind SEED_DEMO=1)
// ---------------------------------------------------------------------------
// Namespace rules:
//   - User emails:       demo+<tag>@tinykloset.demo
//   - Storefront slugs:  demo-<name>
//   - Listing ids:       demo-listing-<store>-<n>   (e.g. demo-listing-1-01)
//   - Image ids:         demo-img-<store>-<n>-<pos>  (e.g. demo-img-1-01-1)
//
// These patterns NEVER match the e2e teardown predicate
// (email startsWith 'e2e+' AND endsWith '@test.tk'), so globalTeardown is safe.
// ---------------------------------------------------------------------------

interface DemoStorefrontDef {
  userId: string;
  email: string;
  name: string;
  storefrontId: string;
  slug: string;
  bio: string;
  avatarUrl?: string;
  bannerUrl?: string;
}

const DEMO_STOREFRONTS: DemoStorefrontDef[] = [
  {
    userId: "demo-user-1",
    email: "demo+sunshine@tinykloset.demo",
    name: "Sunshine Baby Boutique",
    storefrontId: "demo-store-1",
    slug: "demo-sunshine-baby",
    bio: "Gently loved children's clothing and accessories. Based in Austin, TX. Fast shipping!",
    avatarUrl: "https://picsum.photos/seed/demo-store1-avatar/200/200",
    bannerUrl: "https://picsum.photos/seed/demo-store1-banner/1200/400",
  },
  {
    userId: "demo-user-2",
    email: "demo+littlestars@tinykloset.demo",
    name: "Little Stars Closet",
    storefrontId: "demo-store-2",
    slug: "demo-little-stars",
    bio: "Designer and boutique kids' pieces at a fraction of the price. All items cleaned & pressed.",
    avatarUrl: "https://picsum.photos/seed/demo-store2-avatar/200/200",
    bannerUrl: "https://picsum.photos/seed/demo-store2-banner/1200/400",
  },
  {
    userId: "demo-user-3",
    email: "demo+tinytrends@tinykloset.demo",
    name: "Tiny Trends",
    storefrontId: "demo-store-3",
    slug: "demo-tiny-trends",
    bio: "Curated seasonal kidswear — from cozy winter layers to breezy summer dresses.",
    avatarUrl: "https://picsum.photos/seed/demo-store3-avatar/200/200",
    bannerUrl: "https://picsum.photos/seed/demo-store3-banner/1200/400",
  },
];

interface DemoListingDef {
  id: string;
  storefrontId: string;
  title: string;
  description: string;
  priceCents: number;
  categorySlug: string;
  conditionSlug: string;
  sizeId: string;
  brandName: string;
  images: { id: string; url: string; position: number }[];
}

// picsum.photos/seed/<stable-seed>/480/600 — stable, deterministic URLs
const DEMO_LISTINGS: DemoListingDef[] = [
  // ── Store 1: Sunshine Baby Boutique ─────────────────────────────────────
  {
    id: "demo-listing-1-01",
    storefrontId: "demo-store-1",
    title: "Floral Ruffle Top",
    description: "Adorable pink floral ruffle top with button closure at the back. Perfect for spring outings. Worn twice, excellent condition.",
    priceCents: 1200,
    categorySlug: "tops",
    conditionSlug: "excellent",
    sizeId: "size_2t",
    brandName: "Carter's",
    images: [{ id: "demo-img-1-01-1", url: "https://picsum.photos/seed/dli101a/480/600", position: 0 }],
  },
  {
    id: "demo-listing-1-02",
    storefrontId: "demo-store-1",
    title: "Denim Jogger Pants",
    description: "Stretchy denim-look jogger pants with elastic waistband and cuffed ankles. Great for active toddlers.",
    priceCents: 950,
    categorySlug: "bottoms",
    conditionSlug: "good",
    sizeId: "size_3t",
    brandName: "Gap Kids",
    images: [{ id: "demo-img-1-02-1", url: "https://picsum.photos/seed/dli102a/480/600", position: 0 }],
  },
  {
    id: "demo-listing-1-03",
    storefrontId: "demo-store-1",
    title: "Rainbow Smocked Dress",
    description: "Sweet rainbow smocked dress with puff sleeves. Pristine — new with original tags still attached.",
    priceCents: 2800,
    categorySlug: "dresses",
    conditionSlug: "new-with-tags",
    sizeId: "size_4t",
    brandName: "Janie and Jack",
    images: [
      { id: "demo-img-1-03-1", url: "https://picsum.photos/seed/dli103a/480/600", position: 0 },
      { id: "demo-img-1-03-2", url: "https://picsum.photos/seed/dli103b/480/600", position: 1 },
    ],
  },
  {
    id: "demo-listing-1-04",
    storefrontId: "demo-store-1",
    title: "Cozy Puffer Vest",
    description: "Lightweight puffer vest in navy. Keeps little ones warm without restricting arm movement. Great layering piece.",
    priceCents: 1500,
    categorySlug: "outerwear",
    conditionSlug: "excellent",
    sizeId: "size_5t",
    brandName: "Old Navy",
    images: [{ id: "demo-img-1-04-1", url: "https://picsum.photos/seed/dli104a/480/600", position: 0 }],
  },
  {
    id: "demo-listing-1-05",
    storefrontId: "demo-store-1",
    title: "Cloud Print Footie PJs",
    description: "Soft cotton cloud-print footie pajamas with zip front. Machine washable. Worn only a handful of times.",
    priceCents: 800,
    categorySlug: "sleepwear",
    conditionSlug: "good",
    sizeId: "size_18-24m",
    brandName: "Carter's",
    images: [{ id: "demo-img-1-05-1", url: "https://picsum.photos/seed/dli105a/480/600", position: 0 }],
  },
  {
    id: "demo-listing-1-06",
    storefrontId: "demo-store-1",
    title: "White Leather Mary Janes",
    description: "Classic white leather Mary Jane shoes with velcro strap. Scuff-free — barely worn to one family event.",
    priceCents: 2200,
    categorySlug: "footwear",
    conditionSlug: "excellent",
    sizeId: "size_6",
    brandName: "Stride Rite",
    images: [
      { id: "demo-img-1-06-1", url: "https://picsum.photos/seed/dli106a/480/600", position: 0 },
      { id: "demo-img-1-06-2", url: "https://picsum.photos/seed/dli106b/480/600", position: 1 },
    ],
  },

  // ── Store 2: Little Stars Closet ─────────────────────────────────────────
  {
    id: "demo-listing-2-01",
    storefrontId: "demo-store-2",
    title: "Striped Henley Tee",
    description: "Navy and white striped henley-neck tee. 100% cotton, breathable for warmer months.",
    priceCents: 700,
    categorySlug: "tops",
    conditionSlug: "good",
    sizeId: "size_6",
    brandName: "H&M",
    images: [{ id: "demo-img-2-01-1", url: "https://picsum.photos/seed/dli201a/480/600", position: 0 }],
  },
  {
    id: "demo-listing-2-02",
    storefrontId: "demo-store-2",
    title: "Plaid Flannel Shorts",
    description: "Comfortable plaid flannel shorts with drawstring waist and side pockets. Great for casual weekend wear.",
    priceCents: 650,
    categorySlug: "bottoms",
    conditionSlug: "good",
    sizeId: "size_7",
    brandName: "Cherokee",
    images: [{ id: "demo-img-2-02-1", url: "https://picsum.photos/seed/dli202a/480/600", position: 0 }],
  },
  {
    id: "demo-listing-2-03",
    storefrontId: "demo-store-2",
    title: "Boho Tiered Maxi Dress",
    description: "Boho-style tiered maxi dress in dusty rose. Adjustable straps. Worn twice for special occasions.",
    priceCents: 3400,
    categorySlug: "dresses",
    conditionSlug: "excellent",
    sizeId: "size_8",
    brandName: "Zara Kids",
    images: [
      { id: "demo-img-2-03-1", url: "https://picsum.photos/seed/dli203a/480/600", position: 0 },
      { id: "demo-img-2-03-2", url: "https://picsum.photos/seed/dli203b/480/600", position: 1 },
    ],
  },
  {
    id: "demo-listing-2-04",
    storefrontId: "demo-store-2",
    title: "Knit Beanie Hat",
    description: "Chunky knit beanie in warm oatmeal colour. Fits most toddler heads. New with tags.",
    priceCents: 900,
    categorySlug: "accessories",
    conditionSlug: "new-with-tags",
    sizeId: "size_2t",
    brandName: "Gap Kids",
    images: [{ id: "demo-img-2-04-1", url: "https://picsum.photos/seed/dli204a/480/600", position: 0 }],
  },
  {
    id: "demo-listing-2-05",
    storefrontId: "demo-store-2",
    title: "Rain Boot Set — Frog Print",
    description: "Adorable frog-print rain boots with easy pull tabs. Includes matching rain poncho. Perfect condition.",
    priceCents: 2600,
    categorySlug: "footwear",
    conditionSlug: "excellent",
    sizeId: "size_3t",
    brandName: "Hunter",
    images: [
      { id: "demo-img-2-05-1", url: "https://picsum.photos/seed/dli205a/480/600", position: 0 },
      { id: "demo-img-2-05-2", url: "https://picsum.photos/seed/dli205b/480/600", position: 1 },
    ],
  },

  // ── Store 3: Tiny Trends ──────────────────────────────────────────────────
  {
    id: "demo-listing-3-01",
    storefrontId: "demo-store-3",
    title: "Sherpa Lined Hoodie",
    description: "Super-soft sherpa-lined zip hoodie in heather grey. Interior fleece lining keeps little ones snug.",
    priceCents: 1800,
    categorySlug: "outerwear",
    conditionSlug: "excellent",
    sizeId: "size_4t",
    brandName: "Patagonia",
    images: [
      { id: "demo-img-3-01-1", url: "https://picsum.photos/seed/dli301a/480/600", position: 0 },
      { id: "demo-img-3-01-2", url: "https://picsum.photos/seed/dli301b/480/600", position: 1 },
    ],
  },
  {
    id: "demo-listing-3-02",
    storefrontId: "demo-store-3",
    title: "Star Wars Two-Piece PJ Set",
    description: "Official Star Wars long-sleeve pajama set. Top + pants, 100% cotton. Gently used, no pilling.",
    priceCents: 1100,
    categorySlug: "sleepwear",
    conditionSlug: "good",
    sizeId: "size_5t",
    brandName: "Disney",
    images: [{ id: "demo-img-3-02-1", url: "https://picsum.photos/seed/dli302a/480/600", position: 0 }],
  },
  {
    id: "demo-listing-3-03",
    storefrontId: "demo-store-3",
    title: "High-Top Canvas Sneakers",
    description: "Classic white high-top canvas sneakers with rainbow laces. Soles still very clean — worn a few times indoors.",
    priceCents: 1650,
    categorySlug: "footwear",
    conditionSlug: "good",
    sizeId: "size_8",
    brandName: "Converse",
    images: [{ id: "demo-img-3-03-1", url: "https://picsum.photos/seed/dli303a/480/600", position: 0 }],
  },
  {
    id: "demo-listing-3-04",
    storefrontId: "demo-store-3",
    title: "Embroidered Floral Hair Clips Set",
    description: "Set of 6 embroidered floral hair clips in assorted colours. Brand new in original packaging.",
    priceCents: 500,
    categorySlug: "accessories",
    conditionSlug: "new-with-tags",
    sizeId: "size_0-3m",
    brandName: "Gymboree",
    images: [{ id: "demo-img-3-04-1", url: "https://picsum.photos/seed/dli304a/480/600", position: 0 }],
  },
];

async function seedDemo() {
  // ── 1. Upsert demo users ─────────────────────────────────────────────────
  for (const sf of DEMO_STOREFRONTS) {
    await prisma.user.upsert({
      where: { email: sf.email },
      update: { name: sf.name },
      create: {
        id: sf.userId,
        email: sf.email,
        name: sf.name,
        passwordHash: null, // display-only, not meant to log in
        role: "USER",
      },
    });
  }

  // ── 2. Upsert storefronts ────────────────────────────────────────────────
  for (const sf of DEMO_STOREFRONTS) {
    // Look up the user id (in case user already existed with a different id)
    const user = await prisma.user.findUnique({ where: { email: sf.email } });
    if (!user) throw new Error(`Demo user not found: ${sf.email}`);
    await prisma.storefront.upsert({
      where: { slug: sf.slug },
      update: { name: sf.name, bio: sf.bio, avatarUrl: sf.avatarUrl, bannerUrl: sf.bannerUrl },
      create: {
        id: sf.storefrontId,
        userId: user.id,
        slug: sf.slug,
        name: sf.name,
        bio: sf.bio,
        avatarUrl: sf.avatarUrl,
        bannerUrl: sf.bannerUrl,
        status: "ACTIVE",
      },
    });
  }

  // ── 3. Seed listings ──────────────────────────────────────────────────────
  for (const listing of DEMO_LISTINGS) {
    // Resolve taxonomy at runtime (never hardcode ids)
    const category = await prisma.category.findUnique({ where: { slug: listing.categorySlug } });
    if (!category) throw new Error(`Category not found: ${listing.categorySlug}`);

    const condition = await prisma.condition.findUnique({ where: { slug: listing.conditionSlug } });
    if (!condition) throw new Error(`Condition not found: ${listing.conditionSlug}`);

    const size = await prisma.size.findUnique({ where: { id: listing.sizeId } });
    if (!size) throw new Error(`Size not found: ${listing.sizeId}`);

    const brand = await findOrCreateBrand(prisma, listing.brandName);

    // Resolve storefrontId (stable slug lookup, not hardcoded cuid)
    const storefrontDef = DEMO_STOREFRONTS.find((s) => s.storefrontId === listing.storefrontId);
    if (!storefrontDef) throw new Error(`Storefront def not found: ${listing.storefrontId}`);
    const storefront = await prisma.storefront.findUnique({ where: { slug: storefrontDef.slug } });
    if (!storefront) throw new Error(`Storefront not found: ${storefrontDef.slug}`);

    await prisma.listing.upsert({
      where: { id: listing.id },
      update: {
        title: listing.title,
        description: listing.description,
        priceCents: listing.priceCents,
        categoryId: category.id,
        conditionId: condition.id,
        sizeId: size.id,
        brandId: brand?.id,
        status: "LIVE",
      },
      create: {
        id: listing.id,
        storefrontId: storefront.id,
        title: listing.title,
        description: listing.description,
        priceCents: listing.priceCents,
        categoryId: category.id,
        conditionId: condition.id,
        sizeId: size.id,
        brandId: brand?.id,
        status: "LIVE",
      },
    });

    // Upsert listing images (deterministic ids)
    for (const img of listing.images) {
      await prisma.listingImage.upsert({
        where: { id: img.id },
        update: { url: img.url, position: img.position },
        create: {
          id: img.id,
          listingId: listing.id,
          url: img.url,
          position: img.position,
        },
      });
    }
  }

  // ── 4. Count and report ──────────────────────────────────────────────────
  const demoUserCount = await prisma.user.count({
    where: { email: { startsWith: "demo+" } },
  });
  const demoStorefrontCount = await prisma.storefront.count({
    where: { slug: { startsWith: "demo-" } },
  });
  const demoListingCount = await prisma.listing.count({
    where: { id: { startsWith: "demo-listing-" } },
  });
  const demoImageCount = await prisma.listingImage.count({
    where: { id: { startsWith: "demo-img-" } },
  });

  console.log(
    `Demo seed: ${demoStorefrontCount} storefronts, ${demoListingCount} listings, ${demoImageCount} images (${demoUserCount} demo users).`
  );
}

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

  if (process.env.SEED_DEMO === "1") {
    await seedDemo();
  } else {
    console.log("Demo seed: skipped (set SEED_DEMO=1 to enable).");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
