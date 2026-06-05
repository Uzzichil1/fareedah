# Phase 3c — Public discovery (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public, no-login browse of `LIVE` listings (home page grid with filters/sort/pagination), listing detail pages, and storefront pages.

**Architecture:** A pure, unit-tested `buildListingWhere(params)` builds the Prisma `where` and is **always pinned to `status: "LIVE"`** (the public-leak security invariant — client `status` is ignored). Pages are server components that read `searchParams`/`params` (Promises in Next 16) and query Prisma. Shared `ListingCard` + a GET-form `FilterBar`. No schema change.

**Tech Stack:** Next.js 16.2.7 (App Router, server components), React 19.2, Prisma 7.8, Vitest. Functional-only UI (bare Tailwind, consistent with prior phases).

**Spec:** `docs/superpowers/specs/2026-06-05-phase-3c-discovery-design.md` (read it first).

**Critical context:** deliberately modified Next.js 16 — `searchParams` and `params` are **Promises**, `await` them. `@/` → `src/`. `prisma` from `@/lib/db`; `centsToDollars`/`dollarsToCents` from `@/lib/money`; taxonomy loaders in `@/lib/taxonomy`. Status string literals match `ListingStatus`. **Security invariant:** every public query must be pinned to `status: "LIVE"` — never expose DRAFT/PENDING_REVIEW/REJECTED/SOLD/ARCHIVED. `next/image` already allows `res.cloudinary.com`. The home page (`src/app/page.tsx`, currently the Phase 1 landing) is **replaced** by the browse grid.

---

## File Structure

**Created:**
- `src/lib/listing-query.ts` (+ `.test.ts`) — `buildListingWhere`, `parseSort`, `PAGE_SIZE`.
- `src/components/listings/ListingCard.tsx` — shared card.
- `src/components/listings/FilterBar.tsx` — GET-form filter bar (server component).
- `src/app/listings/[id]/page.tsx` — listing detail.
- `src/app/store/[slug]/page.tsx` — storefront.

**Modified:**
- `src/lib/taxonomy.ts` — add `getLeafCategories`, `getBrands`.
- `src/app/page.tsx` — replace landing with the browse grid.
- `README.md` — Phase 3c note.

---

## Task 1: Listing query builder (TDD)

**Files:** `src/lib/listing-query.ts`, `src/lib/listing-query.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/listing-query.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildListingWhere, parseSort } from "./listing-query";

describe("buildListingWhere", () => {
  it("always pins status to LIVE, even with no params", () => {
    expect(buildListingWhere({}).status).toBe("LIVE");
  });
  it("ignores a client-supplied status (no public leak)", () => {
    // status is not part of the accepted params; even if passed, it's ignored.
    const where = buildListingWhere({ status: "DRAFT" } as never);
    expect(where.status).toBe("LIVE");
  });
  it("maps category/size/condition/brand to FK equality", () => {
    const w = buildListingWhere({ category: "c", size: "s", condition: "k", brand: "b" });
    expect(w.categoryId).toBe("c");
    expect(w.sizeId).toBe("s");
    expect(w.conditionId).toBe("k");
    expect(w.brandId).toBe("b");
  });
  it("builds a price range in cents, including one-sided bounds", () => {
    expect(buildListingWhere({ priceMin: "10" }).priceCents).toEqual({ gte: 1000 });
    expect(buildListingWhere({ priceMax: "25.50" }).priceCents).toEqual({ lte: 2550 });
    expect(buildListingWhere({ priceMin: "10", priceMax: "20" }).priceCents).toEqual({ gte: 1000, lte: 2000 });
  });
  it("omits the price filter when bounds are missing or unparseable", () => {
    expect(buildListingWhere({}).priceCents).toBeUndefined();
    expect(buildListingWhere({ priceMin: "abc" }).priceCents).toBeUndefined();
  });
  it("does a case-insensitive title search", () => {
    expect(buildListingWhere({ q: "romper" }).title).toEqual({ contains: "romper", mode: "insensitive" });
    expect(buildListingWhere({ q: "   " }).title).toBeUndefined();
  });
});

describe("parseSort", () => {
  it("whitelists known sorts, defaults unknown to newest", () => {
    expect(parseSort("price_asc")).toEqual({ priceCents: "asc" });
    expect(parseSort("price_desc")).toEqual({ priceCents: "desc" });
    expect(parseSort("newest")).toEqual({ createdAt: "desc" });
    expect(parseSort(undefined)).toEqual({ createdAt: "desc" });
    expect(parseSort("; DROP TABLE")).toEqual({ createdAt: "desc" });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/lib/listing-query.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

Create `src/lib/listing-query.ts`:
```ts
import type { Prisma } from "@/generated/prisma/client";
import { dollarsToCents } from "@/lib/money";

export const PAGE_SIZE = 24;

/** Accepted public filter params. Note: there is intentionally NO `status`
 *  field — the public can never widen the query beyond LIVE. */
export type ListingFilterParams = {
  category?: string;
  size?: string;
  condition?: string;
  brand?: string;
  priceMin?: string;
  priceMax?: string;
  q?: string;
};

/** Build the Prisma where for public browse. ALWAYS pinned to LIVE. */
export function buildListingWhere(params: ListingFilterParams): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = { status: "LIVE" };

  if (params.category) where.categoryId = params.category;
  if (params.size) where.sizeId = params.size;
  if (params.condition) where.conditionId = params.condition;
  if (params.brand) where.brandId = params.brand;

  const min = params.priceMin ? dollarsToCents(params.priceMin) : null;
  const max = params.priceMax ? dollarsToCents(params.priceMax) : null;
  if (min !== null || max !== null) {
    where.priceCents = {
      ...(min !== null ? { gte: min } : {}),
      ...(max !== null ? { lte: max } : {}),
    };
  }

  if (params.q && params.q.trim()) {
    where.title = { contains: params.q.trim(), mode: "insensitive" };
  }

  return where;
}

const SORT_MAP: Record<string, Prisma.ListingOrderByWithRelationInput> = {
  newest: { createdAt: "desc" },
  price_asc: { priceCents: "asc" },
  price_desc: { priceCents: "desc" },
};

/** Whitelist the sort param; unknown values fall back to newest. */
export function parseSort(sort: string | undefined): Prisma.ListingOrderByWithRelationInput {
  return (sort ? SORT_MAP[sort] : undefined) ?? SORT_MAP.newest;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/lib/listing-query.test.ts` — Expected: PASS. If TS errors on the `Prisma` import path, the generated `Prisma` namespace is exported from `@/generated/prisma/client` (same module the `PrismaClient` type comes from); if not found there, import from `@/generated/prisma/models` and note it. (`mode: "insensitive"` is valid on Postgres string filters.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/listing-query.ts src/lib/listing-query.test.ts
git commit -m "Add LIVE-pinned listing query builder + sort whitelist"
```

> **Reviewer note (security):** grep that `buildListingWhere` sets `status: "LIVE"` and that `ListingFilterParams` has NO `status` field (the public can't widen the query). Confirm the "ignores client status" test passes.

---

## Task 2: Taxonomy loaders for filters

**Files:** `src/lib/taxonomy.ts` (modify)

- [ ] **Step 1: Add `getLeafCategories` and `getBrands`**

In `src/lib/taxonomy.ts`, append two new loaders (keep the existing `getConditions`/`getSizes`/`getCategories`):
```ts
/** Leaf categories only (those with no children) — what listings are tagged with. */
export const getLeafCategories = cache(() =>
  prisma.category.findMany({
    where: { children: { none: {} } },
    orderBy: { name: "asc" },
  }),
);

export const getBrands = cache(() =>
  prisma.brand.findMany({ orderBy: { name: "asc" } }),
);
```

- [ ] **Step 2: Build**

Run: `npm run build` — Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/taxonomy.ts
git commit -m "Add leaf-category and brand loaders for browse filters"
```

---

## Task 3: ListingCard component

**Files:** `src/components/listings/ListingCard.tsx`

- [ ] **Step 1: Implement**

Create `src/components/listings/ListingCard.tsx`:
```tsx
import Link from "next/link";
import Image from "next/image";
import { centsToDollars } from "@/lib/money";

export type ListingCardData = {
  id: string;
  title: string;
  priceCents: number;
  brandName: string | null;
  imageUrl: string | null;
};

export function ListingCard({ listing }: { listing: ListingCardData }) {
  return (
    <Link href={`/listings/${listing.id}`} className="block rounded border p-2 hover:shadow">
      {listing.imageUrl ? (
        <Image
          src={listing.imageUrl}
          alt=""
          width={300}
          height={300}
          className="aspect-square w-full rounded object-cover"
        />
      ) : (
        <div className="aspect-square w-full rounded bg-zinc-100" />
      )}
      <p className="mt-2 truncate font-medium">{listing.title}</p>
      <p className="text-sm text-zinc-500">
        ${centsToDollars(listing.priceCents)}
        {listing.brandName ? ` · ${listing.brandName}` : ""}
      </p>
    </Link>
  );
}
```

- [ ] **Step 2: Build + commit**

Run: `npm run build`. Then:
```bash
git add src/components/listings/ListingCard.tsx
git commit -m "Add shared ListingCard component"
```

---

## Task 4: FilterBar component

**Files:** `src/components/listings/FilterBar.tsx`

- [ ] **Step 1: Implement (server component, GET form)**

Create `src/components/listings/FilterBar.tsx`. A plain `<form method="get">` — no client JS; submitting navigates to `/?…`:
```tsx
type Option = { id: string; label: string };

export type FilterCurrent = {
  category?: string;
  size?: string;
  condition?: string;
  brand?: string;
  priceMin?: string;
  priceMax?: string;
  q?: string;
  sort?: string;
};

export function FilterBar({
  categories,
  sizes,
  conditions,
  brands,
  current,
}: {
  categories: Option[];
  sizes: Option[];
  conditions: Option[];
  brands: Option[];
  current: FilterCurrent;
}) {
  const sel = "rounded border p-1 text-sm";
  return (
    <form method="get" className="mb-6 flex flex-wrap items-center gap-2">
      <input name="q" defaultValue={current.q ?? ""} placeholder="Search…" className={sel} />
      <select name="category" defaultValue={current.category ?? ""} className={sel}>
        <option value="">All categories</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <select name="size" defaultValue={current.size ?? ""} className={sel}>
        <option value="">All sizes</option>
        {sizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <select name="condition" defaultValue={current.condition ?? ""} className={sel}>
        <option value="">All conditions</option>
        {conditions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <select name="brand" defaultValue={current.brand ?? ""} className={sel}>
        <option value="">All brands</option>
        {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
      </select>
      <input name="priceMin" defaultValue={current.priceMin ?? ""} placeholder="Min $" className={`${sel} w-20`} />
      <input name="priceMax" defaultValue={current.priceMax ?? ""} placeholder="Max $" className={`${sel} w-20`} />
      <select name="sort" defaultValue={current.sort ?? "newest"} className={sel}>
        <option value="newest">Newest</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
      </select>
      <button type="submit" className="rounded bg-pink-600 px-3 py-1 text-sm text-white">Filter</button>
    </form>
  );
}
```

- [ ] **Step 2: Build + commit**

Run: `npm run build`. Then:
```bash
git add src/components/listings/FilterBar.tsx
git commit -m "Add browse FilterBar (GET form)"
```

---

## Task 5: Browse grid — replace the home page

**Files:** `src/app/page.tsx` (replace)

- [ ] **Step 1: Replace `src/app/page.tsx`**

Replace the entire file with:
```tsx
import { prisma } from "@/lib/db";
import { buildListingWhere, parseSort, PAGE_SIZE } from "@/lib/listing-query";
import { getLeafCategories, getSizes, getConditions, getBrands } from "@/lib/taxonomy";
import { ListingCard } from "@/components/listings/ListingCard";
import { FilterBar } from "@/components/listings/FilterBar";

type SP = Record<string, string | string[] | undefined>;

function str(sp: SP, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" && v !== "" ? v : undefined;
}

function pageHref(sp: SP, page: number): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k !== "page" && typeof v === "string" && v !== "") q.set(k, v);
  }
  q.set("page", String(page));
  return `/?${q.toString()}`;
}

export default async function HomePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const params = {
    category: str(sp, "category"),
    size: str(sp, "size"),
    condition: str(sp, "condition"),
    brand: str(sp, "brand"),
    priceMin: str(sp, "priceMin"),
    priceMax: str(sp, "priceMax"),
    q: str(sp, "q"),
  };
  const page = Math.max(1, Number(str(sp, "page")) || 1);
  const where = buildListingWhere(params);
  const orderBy = parseSort(str(sp, "sort"));

  const [listings, total, categories, sizes, conditions, brands] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { images: { orderBy: { position: "asc" }, take: 1 }, brand: { select: { name: true } } },
    }),
    prisma.listing.count({ where }),
    getLeafCategories(),
    getSizes(),
    getConditions(),
    getBrands(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-pink-600">TinyKloset</h1>
        <p className="text-sm text-zinc-500">Curated pre-loved &amp; boutique kids&apos; fashion</p>
      </header>

      <FilterBar
        categories={categories.map((c) => ({ id: c.id, label: c.name }))}
        sizes={sizes.map((s) => ({ id: s.id, label: s.label }))}
        conditions={conditions.map((c) => ({ id: c.id, label: c.name }))}
        brands={brands.map((b) => ({ id: b.id, label: b.name }))}
        current={{ ...params, sort: str(sp, "sort") }}
      />

      {listings.length === 0 ? (
        <p className="text-zinc-600">No listings match your filters.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {listings.map((l) => (
              <ListingCard
                key={l.id}
                listing={{
                  id: l.id,
                  title: l.title,
                  priceCents: l.priceCents,
                  brandName: l.brand?.name ?? null,
                  imageUrl: l.images[0]?.url ?? null,
                }}
              />
            ))}
          </div>
          <nav className="mt-6 flex items-center justify-between text-sm">
            <span className="text-zinc-500">{total} item{total === 1 ? "" : "s"} · page {page} of {totalPages}</span>
            <span className="flex gap-2">
              {page > 1 && <a className="rounded border px-3 py-1" href={pageHref(sp, page - 1)}>Previous</a>}
              {page < totalPages && <a className="rounded border px-3 py-1" href={pageHref(sp, page + 1)}>Next</a>}
            </span>
          </nav>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build` — Expected: succeeds; `/` is listed (dynamic, since it reads searchParams).

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "Replace home page with public browse grid"
```

---

## Task 6: Listing detail page

**Files:** `src/app/listings/[id]/page.tsx`

- [ ] **Step 1: Implement (pinned to LIVE)**

Create `src/app/listings/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { centsToDollars } from "@/lib/money";

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await prisma.listing.findFirst({
    where: { id, status: "LIVE" }, // pinned to LIVE — non-live never exposed
    include: {
      images: { orderBy: { position: "asc" } },
      brand: { select: { name: true } },
      category: { select: { name: true } },
      condition: { select: { name: true } },
      size: { select: { label: true } },
      storefront: { select: { name: true, slug: true } },
    },
  });
  if (!listing) notFound();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/" className="text-sm text-pink-600 hover:underline">&larr; Back to browse</Link>
      <div className="mt-3 flex flex-wrap gap-2">
        {listing.images.map((img) => (
          <Image key={img.id} src={img.url} alt="" width={200} height={200} className="rounded object-cover" />
        ))}
      </div>
      <h1 className="mt-4 text-2xl font-semibold">{listing.title}</h1>
      <p className="text-lg text-zinc-700">${centsToDollars(listing.priceCents)}</p>
      <p className="mt-1 text-sm text-zinc-500">
        {listing.category.name} · {listing.condition.name}
        {listing.size ? ` · ${listing.size.label}` : ""}
        {listing.brand ? ` · ${listing.brand.name}` : ""}
      </p>
      <p className="mt-4 whitespace-pre-wrap">{listing.description}</p>
      <p className="mt-6 text-sm">
        Sold by{" "}
        <Link href={`/store/${listing.storefront.slug}`} className="text-pink-600 hover:underline">
          {listing.storefront.name}
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Build + commit**

Run: `npm run build` (expect `/listings/[id]` listed). Then:
```bash
git add "src/app/listings/[id]/page.tsx"
git commit -m "Add public listing detail page (LIVE only)"
```

> **Reviewer note:** confirm the query is `findFirst({ where: { id, status: "LIVE" } })` so non-LIVE ids 404 (no public leak).

---

## Task 7: Storefront page

**Files:** `src/app/store/[slug]/page.tsx`

- [ ] **Step 1: Implement (storefront's LIVE listings only)**

Create `src/app/store/[slug]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ListingCard } from "@/components/listings/ListingCard";

export default async function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const storefront = await prisma.storefront.findUnique({
    where: { slug },
    include: {
      listings: {
        where: { status: "LIVE" }, // only LIVE listings are public
        orderBy: { createdAt: "desc" },
        include: { images: { orderBy: { position: "asc" }, take: 1 }, brand: { select: { name: true } } },
      },
    },
  });
  if (!storefront) notFound();

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{storefront.name}</h1>
        {storefront.bio && <p className="text-sm text-zinc-500">{storefront.bio}</p>}
      </header>
      {storefront.listings.length === 0 ? (
        <p className="text-zinc-600">No items for sale right now.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {storefront.listings.map((l) => (
            <ListingCard
              key={l.id}
              listing={{
                id: l.id,
                title: l.title,
                priceCents: l.priceCents,
                brandName: l.brand?.name ?? null,
                imageUrl: l.images[0]?.url ?? null,
              }}
            />
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Build + commit**

Run: `npm run build` (expect `/store/[slug]` listed). Then:
```bash
git add "src/app/store/[slug]/page.tsx"
git commit -m "Add public storefront page (LIVE listings only)"
```

> **Reviewer note:** confirm `listings: { where: { status: "LIVE" } }` so non-LIVE listings don't show on a storefront.

---

## Task 8: Documentation + final verification

**Files:** `README.md`

- [ ] **Step 1: README note**

In `README.md`, update the Phase 3 status/roadmap to mark **Phase 3c (public discovery)** as done — note the home page `/` is now the browse grid (filters/sort/pagination), plus `/listings/[id]` and `/store/[slug]`. With 3a+3b+3c done, **Phase 3 is complete**. Keep it factual; note that the grid is empty until listings are approved to `LIVE`.

- [ ] **Step 2: Full verification**

Run, and confirm all pass:
```bash
npm run lint
npm test
npm run build
```
Expected: all pass; build lists `/` (dynamic), `/listings/[id]`, `/store/[slug]` plus existing routes.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document Phase 3c"
```

> **After Task 8 (controller, not a subagent task):** the **automated public smoke** — seed a `LIVE` listing (+ storefront) and a non-`LIVE` listing, then assert: `GET /` shows the live one and a too-low `priceMax` hides it and a leaf-category filter narrows; `GET /listings/<live-id>` → 200, `GET /listings/<nonlive-id>` → 404; `GET /store/<slug>` shows the live listing; the non-live one never appears on `/` or the storefront. Clean up the fixtures. (No login needed — fully public.)

---

## Self-Review

**Spec coverage:**
- `LIVE`-pin invariant (always, unbypassable, ignores client status) → Task 1 (+ reviewer grep) and the LIVE pin in Tasks 6/7.
- Full filters (leaf category, size, condition, brand, price range, case-insensitive search) + sort whitelist + page size 24 → Task 1 (logic) + Tasks 4/5 (UI).
- Browse grid on home `/` with pagination → Task 5.
- Listing detail (LIVE-only, 404 otherwise) → Task 6.
- Storefront (LIVE listings only) → Task 7.
- Leaf-only category filter (avoids the parent zero-results trap) → Task 2 (`getLeafCategories`) + Task 5.
- Docs + automated public smoke → Task 8 + note.

**Placeholder scan:** every code step shows full code; commands show expected output. `pageHref`/`str` helpers are defined inline in Task 5.

**Type consistency:** `ListingCardData {id,title,priceCents,brandName,imageUrl}` matches the mappers in Tasks 5/7. `buildListingWhere`/`parseSort`/`PAGE_SIZE` signatures match Task 5's usage. `ListingFilterParams` has no `status` (the invariant). Pages await the `searchParams`/`params` Promises. Status literal `"LIVE"` matches `ListingStatus`.

**Known watch-items:** (1) the `Prisma` namespace import path (Task 1 Step 4 note); (2) the `LIVE` pin is the security invariant — grepped in review and verify-don't-assume in the smoke (non-live 404s / absent); (3) the home grid is empty until listings are `LIVE` — flag to the user post-merge.
