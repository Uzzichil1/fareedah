# Phase 3a — Seller onboarding + Listing create/edit + Cloudinary signed uploads (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let sellers open a storefront and create, edit, and submit listings (with images) for review, on top of the Phase 2 schema/auth/DAL.

**Architecture:** Server Actions enforce auth via the DAL (`verifySession`/`requireSeller`) and persist `Listing`/`ListingImage`/`Storefront` rows. Images upload **directly** from the browser to Cloudinary using a **server-generated signature** (hand-rolled SHA-1 per Cloudinary's documented algorithm — no SDK). Taxonomy (Condition/Category/Size) is seeded idempotently; Brand is find-or-create. New listings are `DRAFT`, then `submitListing` validates strictly and sets `PENDING_REVIEW`.

**Tech Stack:** Next.js 16.2.7 (App Router, Server Actions, Turbopack), React 19.2, Prisma 7.8, `zod`, `react-hook-form`, `@hookform/resolvers`, Node `crypto`, `tsx` (seed runner). Vitest for units.

**Spec:** `docs/superpowers/specs/2026-06-03-phase-3a-seller-listings-design.md` (read it first).

**Critical context (modified Next.js 16):** read `node_modules/next/dist/docs/` before writing Next code. Cloudinary creds are ABSENT from `.env`, so the real upload round-trip is **code-verified only** (signature is unit-tested; build passes) — do not claim it as runtime-verified. `@/` → `src/`. The DAL exposes `verifySession(): {userId, role}`, `requireSeller(): {userId, storefrontId}` (redirects storefront-less users to `/sell/start`), `getCurrentUser()`. `prisma` is exported from `@/lib/db`. Generated Prisma types/`PrismaClient` import from `@/generated/prisma/client`. Listing status values are string literals (`"DRAFT"`, `"PENDING_REVIEW"`). `Listing.categoryId` and `Listing.conditionId` are REQUIRED FKs (so even a draft must have a category + condition); `sizeId`/`brandId` are optional.

---

## File Structure

**Created:**
- `prisma/seed.ts` — idempotent taxonomy seed.
- `src/lib/slug.ts` — `slugify`, `uniqueSlug`.
- `src/lib/slug.test.ts`
- `src/lib/money.ts` — `dollarsToCents`, `centsToDollars`.
- `src/lib/money.test.ts`
- `src/lib/cloudinary.ts` — `buildUploadSignature` (pure).
- `src/lib/cloudinary.test.ts`
- `src/lib/brands.ts` — `findOrCreateBrand`.
- `src/lib/brands.test.ts`
- `src/lib/validation/storefront.ts`, `src/lib/validation/listing.ts` (+ `.test.ts`)
- `src/lib/taxonomy.ts` — server data loaders for selects.
- `src/app/sell/actions.ts` — server actions (storefront + listings + upload signature).
- `src/app/sell/start/page.tsx`, `src/components/sell/StorefrontForm.tsx`
- `src/app/sell/page.tsx` — seller dashboard (acceptance surface).
- `src/app/sell/listings/new/page.tsx`, `src/app/sell/listings/[id]/edit/page.tsx`
- `src/components/sell/ListingForm.tsx`, `src/components/sell/ImageUploader.tsx`

**Modified:**
- `package.json` — `tsx` dev dep, `db:seed` script.
- `prisma.config.ts` — `migrations.seed`.
- `next.config.ts` — `images.remotePatterns`.
- `prisma/schema.prisma` — `ListingImage.publicId`.
- `prisma/migrations/**` — `listing-image-public-id` migration.
- `.env.example` / `README.md` — docs.

---

## Task 1: Dependencies and configuration

**Files:** `package.json`, `prisma.config.ts`, `next.config.ts`

- [ ] **Step 1: Install `tsx`**

Run: `npm install -D tsx`
Expected: installs cleanly. (No Cloudinary SDK — signing is hand-rolled with Node `crypto`.)

- [ ] **Step 2: Add the `db:seed` script**

In `package.json` `"scripts"`, add: `"db:seed": "tsx prisma/seed.ts"`.

- [ ] **Step 3: Wire the seed into Prisma config**

In `prisma.config.ts`, add `seed` under `migrations`:
```ts
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
```

- [ ] **Step 4: Allow Cloudinary images in `next.config.ts`**

Replace `next.config.ts` contents with:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [new URL("https://res.cloudinary.com/**")],
  },
};

export default nextConfig;
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json prisma.config.ts next.config.ts
git commit -m "Add tsx + db:seed; allow Cloudinary remote images"
```

---

## Task 2: Add `ListingImage.publicId` (schema + migration)

**Files:** `prisma/schema.prisma`, `prisma/migrations/**`

- [ ] **Step 1: Add the field**

In `prisma/schema.prisma`, in `model ListingImage`, add `publicId` after `url`:
```prisma
model ListingImage {
  id        String  @id @default(cuid())
  listingId String
  url       String
  publicId  String?
  position  Int     @default(0)

  listing Listing @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@index([listingId])
}
```

- [ ] **Step 2: Validate, migrate (live Supabase), generate**

Confirm `.env`'s `DIRECT_URL` host is the intended Supabase project (`kmtbgaayccnqgzjiqspc`) before applying. Then:
```bash
npx prisma validate
npx prisma migrate dev --name listing-image-public-id
```
Expected: a new migration `prisma/migrations/<ts>_listing_image_public_id/migration.sql` (an `ALTER TABLE "ListingImage" ADD COLUMN "publicId" TEXT;`), applied, "in sync". If the DB is unreachable, use `--create-only` and report the apply as pending. If a destructive reset is prompted, STOP and report BLOCKED.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add ListingImage.publicId for Cloudinary asset references"
```

---

## Task 3: Taxonomy seed

**Files:** `prisma/seed.ts`

- [ ] **Step 1: Write the seed**

Create `prisma/seed.ts`:
```ts
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
```
(Depends on `src/lib/slug.ts` from Task 4 — if implementing strictly in order, do Task 4 first, or inline a local `slugify`. The committed plan orders Task 4 before running the seed in Step 2 below; create `src/lib/slug.ts` first if not present.)

- [ ] **Step 2: Run the seed (idempotent, live Supabase)**

Confirm the `DIRECT_URL` target, then:
```bash
npm run db:seed
```
Expected: "Seed complete…". Run it **twice** and confirm the second run also succeeds with no duplicate-key errors (idempotency check).

- [ ] **Step 3: Verify counts**

Run: `npx prisma db execute --stdin <<< "select (select count(*) from \"Condition\") c, (select count(*) from \"Category\") cat, (select count(*) from \"Size\") s;"` — or inspect via Supabase. Expected: 4 conditions, 8 categories (3 parents + 5 children), 15 sizes. (If `db execute` syntax differs in Prisma 7, just confirm via the Supabase dashboard.)

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "Add idempotent taxonomy seed (conditions, categories, sizes)"
```

---

## Task 4: Slug and money utilities (TDD)

**Files:** `src/lib/slug.ts`, `src/lib/slug.test.ts`, `src/lib/money.ts`, `src/lib/money.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/slug.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("lowercases, trims, and hyphenates", () => {
    expect(slugify("  Baby Gap Onesie!  ")).toBe("baby-gap-onesie");
  });
  it("collapses non-alphanumerics and strips edge hyphens", () => {
    expect(slugify("H&M / Kids")).toBe("h-m-kids");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when it does not exist", async () => {
    expect(await uniqueSlug("shop", async () => false)).toBe("shop");
  });
  it("suffixes until free", async () => {
    const taken = new Set(["shop", "shop-2"]);
    expect(await uniqueSlug("shop", async (s) => taken.has(s))).toBe("shop-3");
  });
});
```

Create `src/lib/money.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { dollarsToCents, centsToDollars } from "./money";

describe("dollarsToCents", () => {
  it("parses integers and decimals to integer cents", () => {
    expect(dollarsToCents("10")).toBe(1000);
    expect(dollarsToCents("10.5")).toBe(1050);
    expect(dollarsToCents("10.99")).toBe(1099);
    expect(dollarsToCents("0")).toBe(0);
  });
  it("rejects invalid input", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("10.999")).toBeNull();
    expect(dollarsToCents("-5")).toBeNull();
  });
});

describe("centsToDollars", () => {
  it("formats with two decimals", () => {
    expect(centsToDollars(1099)).toBe("10.99");
    expect(centsToDollars(1000)).toBe("10.00");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/lib/slug.test.ts src/lib/money.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

Create `src/lib/slug.ts`:
```ts
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = base || "item";
  let candidate = root;
  let n = 1;
  while (await exists(candidate)) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}
```

Create `src/lib/money.ts`:
```ts
/** Parse a dollar string to integer cents, or null if invalid. No float math. */
export function dollarsToCents(input: string): number | null {
  const t = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/lib/slug.test.ts src/lib/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slug.ts src/lib/slug.test.ts src/lib/money.ts src/lib/money.test.ts
git commit -m "Add slug and money utilities"
```

---

## Task 5: Cloudinary signature builder (TDD)

**Files:** `src/lib/cloudinary.ts`, `src/lib/cloudinary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/cloudinary.test.ts`. It cross-checks the builder against Cloudinary's documented algorithm (sorted `k=v&k=v` + secret, SHA-1 hex):
```ts
import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { buildUploadSignature } from "./cloudinary";

describe("buildUploadSignature", () => {
  it("matches sorted-params SHA-1 with the secret appended", () => {
    const params = { timestamp: 1234567890, folder: "tinykloset/listings" };
    const secret = "test_secret";
    const expected = createHash("sha1")
      .update("folder=tinykloset/listings&timestamp=1234567890" + secret)
      .digest("hex");
    expect(buildUploadSignature(params, secret)).toBe(expected);
  });

  it("is deterministic and order-independent in input", () => {
    const secret = "s";
    const a = buildUploadSignature({ a: 1, b: 2 }, secret);
    const b = buildUploadSignature({ b: 2, a: 1 }, secret);
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/lib/cloudinary.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

Create `src/lib/cloudinary.ts`:
```ts
import { createHash } from "crypto";

/**
 * Cloudinary signed-upload signature: sort params by key, join as
 * `key=value&key=value`, append the API secret, SHA-1 (hex).
 * The params signed here MUST exactly match the params the client POSTs to
 * Cloudinary, or the upload fails with 401 Invalid Signature.
 */
export function buildUploadSignature(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/lib/cloudinary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cloudinary.ts src/lib/cloudinary.test.ts
git commit -m "Add Cloudinary upload signature builder"
```

---

## Task 6: Validation schemas + brand find-or-create (TDD)

**Files:** `src/lib/validation/storefront.ts`, `src/lib/validation/listing.ts`, `src/lib/brands.ts` (+ tests)

- [ ] **Step 1: Write failing tests**

Create `src/lib/validation/listing.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { listingDraftSchema, listingSubmitSchema } from "./listing";

describe("listingDraftSchema", () => {
  it("requires title, category, condition (the non-null FKs)", () => {
    expect(listingDraftSchema.safeParse({ title: "Tee", categoryId: "c", conditionId: "k" }).success).toBe(true);
    expect(listingDraftSchema.safeParse({ title: "", categoryId: "c", conditionId: "k" }).success).toBe(false);
    expect(listingDraftSchema.safeParse({ title: "Tee", categoryId: "", conditionId: "k" }).success).toBe(false);
  });
});

describe("listingSubmitSchema", () => {
  const ok = {
    title: "Cozy tee", description: "Soft cotton tee, barely worn.",
    priceCents: 1200, categoryId: "c", conditionId: "k",
    images: [{ url: "https://x/y.jpg", position: 0 }],
  };
  it("accepts a complete listing", () => {
    expect(listingSubmitSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects zero price and empty images", () => {
    expect(listingSubmitSchema.safeParse({ ...ok, priceCents: 0 }).success).toBe(false);
    expect(listingSubmitSchema.safeParse({ ...ok, images: [] }).success).toBe(false);
  });
});
```

Create `src/lib/validation/storefront.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { storefrontSchema } from "./storefront";

describe("storefrontSchema", () => {
  it("requires a name of >= 2 chars", () => {
    expect(storefrontSchema.safeParse({ name: "Ada's Closet" }).success).toBe(true);
    expect(storefrontSchema.safeParse({ name: "A" }).success).toBe(false);
  });
});
```

Create `src/lib/brands.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { findOrCreateBrand } from "./brands";

describe("findOrCreateBrand", () => {
  it("returns null for blank names", async () => {
    const db = { brand: { upsert: vi.fn() } };
    expect(await findOrCreateBrand(db as never, "   ")).toBeNull();
    expect(db.brand.upsert).not.toHaveBeenCalled();
  });
  it("upserts by slug with the trimmed name", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "b1", name: "Baby Gap", slug: "baby-gap" });
    const db = { brand: { upsert } };
    const brand = await findOrCreateBrand(db as never, "  Baby Gap  ");
    expect(brand?.slug).toBe("baby-gap");
    expect(upsert).toHaveBeenCalledWith({
      where: { slug: "baby-gap" },
      update: {},
      create: { name: "Baby Gap", slug: "baby-gap" },
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/lib/validation/listing.test.ts src/lib/validation/storefront.test.ts src/lib/brands.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/validation/storefront.ts`:
```ts
import { z } from "zod";

export const storefrontSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
});

export type StorefrontInput = z.infer<typeof storefrontSchema>;
```

Create `src/lib/validation/listing.ts`:
```ts
import { z } from "zod";

export const listingImageSchema = z.object({
  url: z.string().url(),
  publicId: z.string().optional(),
  position: z.number().int().min(0),
});

/** Lenient — saving a draft. category + condition are required (non-null FKs). */
export const listingDraftSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  categoryId: z.string().min(1, "Pick a category"),
  conditionId: z.string().min(1, "Pick a condition"),
  description: z.string().trim().max(2000).optional().default(""),
  priceDollars: z.string().trim().optional().default(""),
  sizeId: z.string().optional().default(""),
  brand: z.string().trim().max(60).optional().default(""),
  images: z.array(listingImageSchema).max(8).optional().default([]),
});

/** Strict — submitting for review. */
export const listingSubmitSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  priceCents: z.number().int().positive(),
  categoryId: z.string().min(1),
  conditionId: z.string().min(1),
  sizeId: z.string().optional(),
  images: z.array(listingImageSchema).min(1, "At least one image is required").max(8),
});

export type ListingDraftInput = z.infer<typeof listingDraftSchema>;
```

Create `src/lib/brands.ts`:
```ts
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
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/lib/validation/listing.test.ts src/lib/validation/storefront.test.ts src/lib/brands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation/storefront.ts src/lib/validation/storefront.test.ts src/lib/validation/listing.ts src/lib/validation/listing.test.ts src/lib/brands.ts src/lib/brands.test.ts
git commit -m "Add storefront/listing Zod schemas and brand find-or-create"
```

---

## Task 7: Taxonomy data loaders

**Files:** `src/lib/taxonomy.ts`

- [ ] **Step 1: Implement**

Create `src/lib/taxonomy.ts`:
```ts
import { cache } from "react";
import { prisma } from "@/lib/db";

export const getConditions = cache(() =>
  prisma.condition.findMany({ orderBy: { sortOrder: "asc" } }),
);

export const getSizes = cache(() =>
  prisma.size.findMany({ orderBy: { sortOrder: "asc" } }),
);

/** Categories with their parent, ordered for a grouped select. */
export const getCategories = cache(() =>
  prisma.category.findMany({
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
    include: { parent: { select: { name: true } } },
  }),
);
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/taxonomy.ts
git commit -m "Add taxonomy data loaders for listing form selects"
```

---

## Task 8: Storefront onboarding (`/sell/start`)

**Files:** `src/app/sell/actions.ts`, `src/app/sell/start/page.tsx`, `src/components/sell/StorefrontForm.tsx`

- [ ] **Step 1: Create the server actions file with `createStorefront`**

Create `src/app/sell/actions.ts`:
```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifySession, requireSeller } from "@/lib/dal";
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
```

- [ ] **Step 2: Storefront form (client)**

Create `src/components/sell/StorefrontForm.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { storefrontSchema, type StorefrontInput } from "@/lib/validation/storefront";
import { createStorefront } from "@/app/sell/actions";

export function StorefrontForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState: { errors } } =
    useForm<StorefrontInput>({ resolver: zodResolver(storefrontSchema) });

  function onSubmit(values: StorefrontInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await createStorefront(values);
      if (result?.error) setServerError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <input {...register("name")} placeholder="Storefront name" className="border p-2 rounded" />
      {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      <textarea {...register("bio")} placeholder="Short bio (optional)" className="border p-2 rounded" rows={3} />
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <button disabled={pending} className="bg-pink-600 text-white p-2 rounded">
        {pending ? "Creating…" : "Open my storefront"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: `/sell/start` page (uses `verifySession`, NOT `requireSeller`)**

Create `src/app/sell/start/page.tsx`:
```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { StorefrontForm } from "@/components/sell/StorefrontForm";

export const metadata: Metadata = { title: "Open your storefront" };

export default async function SellStartPage() {
  const { userId } = await verifySession();
  const existing = await prisma.storefront.findUnique({ where: { userId } });
  if (existing) redirect("/sell");

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-2xl font-semibold">Open your storefront</h1>
      <p className="mb-4 text-zinc-600">Set up a storefront to start listing items.</p>
      <StorefrontForm />
    </main>
  );
}
```

- [ ] **Step 4: Build + commit**

Run: `npm run build` (expect `/sell/start` listed). Then:
```bash
git add src/app/sell/actions.ts src/components/sell/StorefrontForm.tsx src/app/sell/start/page.tsx
git commit -m "Add storefront onboarding at /sell/start"
```

---

## Task 9: Seller dashboard (`/sell`)

**Files:** `src/app/sell/page.tsx`

- [ ] **Step 1: Implement the dashboard**

Create `src/app/sell/page.tsx`. `requireSeller` redirects storefront-less users to `/sell/start`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { requireSeller } from "@/lib/dal";
import { centsToDollars } from "@/lib/money";

export const metadata: Metadata = { title: "Your listings" };

export default async function SellDashboardPage() {
  const { storefrontId } = await requireSeller();
  const listings = await prisma.listing.findMany({
    where: { storefrontId },
    orderBy: { updatedAt: "desc" },
    include: { images: { orderBy: { position: "asc" }, take: 1 } },
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your listings</h1>
        <Link href="/sell/listings/new" className="rounded bg-pink-600 px-3 py-2 text-white">
          New listing
        </Link>
      </div>
      {listings.length === 0 ? (
        <p className="text-zinc-600">No listings yet. Create your first one.</p>
      ) : (
        <ul className="divide-y">
          {listings.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-3">
              {l.images[0] ? (
                <Image src={l.images[0].url} alt="" width={48} height={48} className="rounded object-cover" />
              ) : (
                <div className="h-12 w-12 rounded bg-zinc-100" />
              )}
              <div className="flex-1">
                <Link href={`/sell/listings/${l.id}/edit`} className="font-medium hover:underline">
                  {l.title}
                </Link>
                <p className="text-sm text-zinc-500">${centsToDollars(l.priceCents)}</p>
              </div>
              <span className="rounded bg-zinc-100 px-2 py-1 text-xs">{l.status}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Build + commit**

Run: `npm run build` (expect `/sell`). Then:
```bash
git add src/app/sell/page.tsx
git commit -m "Add seller dashboard at /sell"
```

---

## Task 10: Listing server actions

**Files:** `src/app/sell/actions.ts` (extend)

- [ ] **Step 1: Add upload-signature + listing actions**

Append to `src/app/sell/actions.ts` (keep the existing imports; add the new ones):
```ts
import { requireSeller } from "@/lib/dal";
import { dollarsToCents } from "@/lib/money";
import { findOrCreateBrand } from "@/lib/brands";
import { buildUploadSignature } from "@/lib/cloudinary";
import {
  listingDraftSchema,
  listingSubmitSchema,
  type ListingDraftInput,
} from "@/lib/validation/listing";

export type UploadSignature = {
  timestamp: number;
  folder: string;
  signature: string;
  apiKey: string;
  cloudName: string;
};

export async function createUploadSignature(): Promise<UploadSignature> {
  await requireSeller();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "tinykloset/listings";
  const signature = buildUploadSignature(
    { folder, timestamp },
    process.env.CLOUDINARY_API_SECRET ?? "",
  );
  return {
    timestamp,
    folder,
    signature,
    apiKey: process.env.CLOUDINARY_API_KEY ?? "",
    cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "",
  };
}

async function persistImages(listingId: string, images: ListingDraftInput["images"]) {
  await prisma.listingImage.deleteMany({ where: { listingId } });
  if (images.length > 0) {
    await prisma.listingImage.createMany({
      data: images.map((img, i) => ({
        listingId,
        url: img.url,
        publicId: img.publicId ?? null,
        position: img.position ?? i,
      })),
    });
  }
}

/** Create a DRAFT listing. Returns the new id or an error. */
export async function createListing(
  raw: unknown,
): Promise<{ id: string } | { error: string }> {
  const { storefrontId } = await requireSeller();
  const parsed = listingDraftSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the listing details." };
  const d = parsed.data;
  const priceCents = d.priceDollars ? dollarsToCents(d.priceDollars) ?? 0 : 0;
  const brand = d.brand ? await findOrCreateBrand(prisma, d.brand) : null;

  const listing = await prisma.listing.create({
    data: {
      storefrontId,
      title: d.title,
      description: d.description,
      priceCents,
      categoryId: d.categoryId,
      conditionId: d.conditionId,
      sizeId: d.sizeId || null,
      brandId: brand?.id ?? null,
      status: "DRAFT",
    },
  });
  await persistImages(listing.id, d.images);
  return { id: listing.id };
}

async function ownedEditableListing(id: string, storefrontId: string) {
  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing || listing.storefrontId !== storefrontId) return null;
  if (listing.status !== "DRAFT" && listing.status !== "REJECTED") return null;
  return listing;
}

/** Update an owned DRAFT/REJECTED listing. */
export async function updateListing(
  id: string,
  raw: unknown,
): Promise<ActionResult> {
  const { storefrontId } = await requireSeller();
  if (!(await ownedEditableListing(id, storefrontId))) return { error: "This listing can't be edited." };
  const parsed = listingDraftSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the listing details." };
  const d = parsed.data;
  const priceCents = d.priceDollars ? dollarsToCents(d.priceDollars) ?? 0 : 0;
  const brand = d.brand ? await findOrCreateBrand(prisma, d.brand) : null;

  await prisma.listing.update({
    where: { id },
    data: {
      title: d.title,
      description: d.description,
      priceCents,
      categoryId: d.categoryId,
      conditionId: d.conditionId,
      sizeId: d.sizeId || null,
      brandId: brand?.id ?? null,
    },
  });
  await persistImages(id, d.images);
  return undefined;
}

/** Validate the persisted listing strictly and move it to PENDING_REVIEW. */
export async function submitListing(id: string): Promise<ActionResult> {
  const { storefrontId } = await requireSeller();
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { images: true },
  });
  if (!listing || listing.storefrontId !== storefrontId) return { error: "Not found." };
  if (listing.status !== "DRAFT" && listing.status !== "REJECTED") {
    return { error: "This listing can't be submitted." };
  }
  const check = listingSubmitSchema.safeParse({
    title: listing.title,
    description: listing.description,
    priceCents: listing.priceCents,
    categoryId: listing.categoryId,
    conditionId: listing.conditionId,
    sizeId: listing.sizeId ?? undefined,
    images: listing.images.map((i) => ({ url: i.url, publicId: i.publicId ?? undefined, position: i.position })),
  });
  if (!check.success) {
    return { error: "Add a description, a price above $0, and at least one image before submitting." };
  }
  await prisma.listing.update({ where: { id }, data: { status: "PENDING_REVIEW" } });
  redirect("/sell");
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds (type-checks the actions against the Prisma client and DAL).

- [ ] **Step 3: Commit**

```bash
git add src/app/sell/actions.ts
git commit -m "Add listing server actions (create/update/submit) + upload signature"
```

---

## Task 11: Image uploader component

**Files:** `src/components/sell/ImageUploader.tsx`

- [ ] **Step 1: Implement the uploader**

Create `src/components/sell/ImageUploader.tsx`. It requests a signature per file and uploads directly to Cloudinary; it manages an ordered list of `{ url, publicId, position }`:
```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { createUploadSignature } from "@/app/sell/actions";

export type UploadedImage = { url: string; publicId: string; position: number };

const MAX_IMAGES = 8;

export function ImageUploader({
  value,
  onChange,
}: {
  value: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      const next = [...value];
      for (const file of Array.from(files)) {
        if (next.length >= MAX_IMAGES) {
          setError(`Up to ${MAX_IMAGES} images.`);
          break;
        }
        const sig = await createUploadSignature();
        const form = new FormData();
        form.append("file", file);
        form.append("api_key", sig.apiKey);
        form.append("timestamp", String(sig.timestamp));
        form.append("folder", sig.folder);
        form.append("signature", sig.signature);
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
          { method: "POST", body: form },
        );
        if (!res.ok) {
          setError("Upload failed. Check Cloudinary configuration.");
          break;
        }
        const data = (await res.json()) as { secure_url: string; public_id: string };
        next.push({ url: data.secure_url, publicId: data.public_id, position: next.length });
      }
      onChange(next.map((img, i) => ({ ...img, position: i })));
    } finally {
      setBusy(false);
    }
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index).map((img, i) => ({ ...img, position: i })));
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="file" accept="image/*" multiple disabled={busy} onChange={(e) => handleFiles(e.target.files)} />
      {busy && <p className="text-sm text-zinc-500">Uploading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {value.map((img, i) => (
          <div key={img.publicId || img.url} className="relative">
            <Image src={img.url} alt="" width={80} height={80} className="rounded object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute -right-2 -top-2 rounded-full bg-zinc-900 px-1 text-xs text-white"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/sell/ImageUploader.tsx
git commit -m "Add Cloudinary image uploader component"
```

---

## Task 12: Listing form + new/edit pages

**Files:** `src/components/sell/ListingForm.tsx`, `src/app/sell/listings/new/page.tsx`, `src/app/sell/listings/[id]/edit/page.tsx`

- [ ] **Step 1: Listing form (client)**

Create `src/components/sell/ListingForm.tsx`:
```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUploader, type UploadedImage } from "@/components/sell/ImageUploader";
import { createListing, updateListing, submitListing } from "@/app/sell/actions";

type Option = { id: string; label: string };

export type ListingFormProps = {
  listingId?: string;
  categories: Option[];
  conditions: Option[];
  sizes: Option[];
  initial?: {
    title: string;
    description: string;
    priceDollars: string;
    categoryId: string;
    conditionId: string;
    sizeId: string;
    brand: string;
    images: UploadedImage[];
  };
};

export function ListingForm({ listingId, categories, conditions, sizes, initial }: ListingFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [images, setImages] = useState<UploadedImage[]>(initial?.images ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // `submit=false` saves a draft; `submit=true` saves then submits for review.
  function run(submit: boolean) {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const payload = {
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? ""),
      priceDollars: String(fd.get("priceDollars") ?? ""),
      categoryId: String(fd.get("categoryId") ?? ""),
      conditionId: String(fd.get("conditionId") ?? ""),
      sizeId: String(fd.get("sizeId") ?? ""),
      brand: String(fd.get("brand") ?? ""),
      images,
    };
    setError(null);
    startTransition(async () => {
      let id = listingId;
      if (id) {
        const r = await updateListing(id, payload);
        if (r?.error) return setError(r.error);
      } else {
        const r = await createListing(payload);
        if ("error" in r) return setError(r.error);
        id = r.id;
      }
      if (submit && id) {
        const r = await submitListing(id);
        if (r?.error) return setError(r.error);
        // success → submitListing redirects to /sell
      } else {
        router.push("/sell");
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        run(false);
      }}
      className="flex flex-col gap-3"
    >
      <input name="title" defaultValue={initial?.title} placeholder="Title" className="border p-2 rounded" />
      <textarea name="description" defaultValue={initial?.description} placeholder="Description" rows={4} className="border p-2 rounded" />
      <input name="priceDollars" defaultValue={initial?.priceDollars} placeholder="Price (USD, e.g. 12.50)" className="border p-2 rounded" />
      <select name="categoryId" defaultValue={initial?.categoryId ?? ""} className="border p-2 rounded">
        <option value="">Select a category…</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <select name="conditionId" defaultValue={initial?.conditionId ?? ""} className="border p-2 rounded">
        <option value="">Select a condition…</option>
        {conditions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <select name="sizeId" defaultValue={initial?.sizeId ?? ""} className="border p-2 rounded">
        <option value="">Size (optional)…</option>
        {sizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <input name="brand" defaultValue={initial?.brand} placeholder="Brand (optional)" className="border p-2 rounded" />
      <ImageUploader value={images} onChange={setImages} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded bg-zinc-200 px-3 py-2">
          {pending ? "Saving…" : "Save draft"}
        </button>
        <button type="button" disabled={pending} onClick={() => run(true)} className="rounded bg-pink-600 px-3 py-2 text-white">
          Submit for review
        </button>
      </div>
    </form>
  );
}
```
Behavior: both buttons live in one `<form>` (referenced via `formRef`). "Save draft" → `createListing`/`updateListing` then go to `/sell`. "Submit for review" → save, then `submitListing` (which validates strictly and redirects to `/sell` on success).

- [ ] **Step 2: New listing page**

Create `src/app/sell/listings/new/page.tsx`:
```tsx
import type { Metadata } from "next";
import { requireSeller } from "@/lib/dal";
import { getCategories, getConditions, getSizes } from "@/lib/taxonomy";
import { ListingForm } from "@/components/sell/ListingForm";

export const metadata: Metadata = { title: "New listing" };

export default async function NewListingPage() {
  await requireSeller();
  const [categories, conditions, sizes] = await Promise.all([
    getCategories(),
    getConditions(),
    getSizes(),
  ]);
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-2xl font-semibold">New listing</h1>
      <ListingForm
        categories={categories.map((c) => ({ id: c.id, label: c.parent ? `${c.parent.name} › ${c.name}` : c.name }))}
        conditions={conditions.map((c) => ({ id: c.id, label: c.name }))}
        sizes={sizes.map((s) => ({ id: s.id, label: s.label }))}
      />
    </main>
  );
}
```

- [ ] **Step 3: Edit listing page**

Create `src/app/sell/listings/[id]/edit/page.tsx`:
```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSeller } from "@/lib/dal";
import { getCategories, getConditions, getSizes } from "@/lib/taxonomy";
import { centsToDollars } from "@/lib/money";
import { ListingForm } from "@/components/sell/ListingForm";

export const metadata: Metadata = { title: "Edit listing" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { storefrontId } = await requireSeller();
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { images: { orderBy: { position: "asc" } }, brand: true },
  });
  if (!listing || listing.storefrontId !== storefrontId) notFound();

  const [categories, conditions, sizes] = await Promise.all([
    getCategories(),
    getConditions(),
    getSizes(),
  ]);

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-2xl font-semibold">Edit listing</h1>
      <p className="mb-2 text-sm text-zinc-500">Status: {listing.status}</p>
      <ListingForm
        listingId={listing.id}
        categories={categories.map((c) => ({ id: c.id, label: c.parent ? `${c.parent.name} › ${c.name}` : c.name }))}
        conditions={conditions.map((c) => ({ id: c.id, label: c.name }))}
        sizes={sizes.map((s) => ({ id: s.id, label: s.label }))}
        initial={{
          title: listing.title,
          description: listing.description,
          priceDollars: centsToDollars(listing.priceCents),
          categoryId: listing.categoryId,
          conditionId: listing.conditionId,
          sizeId: listing.sizeId ?? "",
          brand: listing.brand?.name ?? "",
          images: listing.images.map((i) => ({ url: i.url, publicId: i.publicId ?? "", position: i.position })),
        }}
      />
    </main>
  );
}
```

- [ ] **Step 4: Build + commit**

Run: `npm run build` (expect `/sell/listings/new` and `/sell/listings/[id]/edit`). Then:
```bash
git add src/components/sell/ListingForm.tsx src/app/sell/listings
git commit -m "Add listing create/edit form and pages"
```

---

## Task 13: Documentation + final verification

**Files:** `.env.example`, `README.md`

- [ ] **Step 1: Confirm env docs**

Confirm `.env.example` documents the `CLOUDINARY_*` vars the code reads (`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`). They are present from P1; if any read var is missing, add it. (Grep `src/` for `process.env.`.)

- [ ] **Step 2: README note**

In `README.md`, add a brief line under the roadmap noting Phase 3a (seller storefront + listing create/submit + Cloudinary signed uploads) is in progress/done, and that real Cloudinary uploads require `CLOUDINARY_*` creds in `.env`. Keep it minimal and factual; do not claim browse/curation (3b/3c) exist.

- [ ] **Step 3: Full verification**

Run:
```bash
npm run lint
npm test
npm run build
```
Expected: all pass; build lists `/sell`, `/sell/start`, `/sell/listings/new`, `/sell/listings/[id]/edit`.

- [ ] **Step 4: Commit**

```bash
git add README.md .env.example
git commit -m "Document Phase 3a"
```

---

## Self-Review

**Spec coverage:**
- Taxonomy seed (idempotent, deterministic size ids) → Task 3.
- `ListingImage.publicId` migration → Task 2.
- Cloudinary signed uploads (signature builder, action, uploader, remotePatterns, no SDK) → Tasks 1, 5, 10, 11.
- Storefront onboarding via `verifySession` (no loop) → Task 8.
- Listing draft→submit CRUD, ownership, dollars→cents, brand find-or-create → Tasks 4, 6, 10, 12.
- Seller dashboard as acceptance surface → Task 9.
- Validation + Vitest units → Tasks 4, 5, 6.
- Docs/verification → Task 13.

**Cloudinary honesty:** Real upload is code-verified only (signature unit-tested, build passes); the uploader's network call to Cloudinary is NOT runtime-verified (creds absent) — Task 13/acceptance must not claim otherwise.

**Placeholder scan:** every code step shows full code; commands show expected output. The `ListingForm` uses a `formRef` so both "Save draft" and "Submit for review" read the same form (no synthetic-event hacks).

**Type consistency:** `UploadedImage {url, publicId, position}` matches `listingImageSchema` and `persistImages`. `createListing` returns `{id} | {error}`; `updateListing`/`submitListing`/`createStorefront` return `ActionResult` (`{error} | undefined`). `requireSeller(): {userId, storefrontId}` and `verifySession(): {userId, role}` match the DAL. Taxonomy loader shapes (`getCategories` includes `parent.name`) match the page mappers. Listing status string literals (`"DRAFT"`, `"PENDING_REVIEW"`) match the Prisma enum.

**Known watch-items:** (1) Cloudinary creds absent → upload smoke deferred; (2) seed + migration write to live Supabase (confirm target, idempotent); (3) `prisma db execute` syntax in Step 3 of Task 3 may vary — fall back to dashboard verification.
