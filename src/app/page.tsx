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
