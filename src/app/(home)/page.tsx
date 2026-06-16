import { prisma } from "@/lib/db";
import { buildListingWhere, parseSort, PAGE_SIZE } from "@/lib/listing-query";
import { getLeafCategories, getSizes, getConditions, getBrands } from "@/lib/taxonomy";
import { ListingCard } from "@/components/listings/ListingCard";
import { FilterBar } from "@/components/listings/FilterBar";
import { SiteHeader } from "@/components/site/SiteHeader";

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
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        brand: { select: { name: true } },
        size: { select: { label: true } },
        condition: { select: { name: true } },
      },
    }),
    prisma.listing.count({ where }),
    getLeafCategories(),
    getSizes(),
    getConditions(),
    getBrands(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <SiteHeader />

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        {/* Editorial hero */}
        <section className="py-12 sm:py-16">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-sage">
            Pre-loved · Boutique · Passed on
          </p>
          <h1 className="font-display text-[2.75rem] font-light leading-[0.98] tracking-tight text-ink sm:text-6xl">
            Little clothes,
            <br />
            <span className="italic text-rose">big stories.</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-soft">
            A curated second life for baby and children&apos;s fashion — gently
            worn, beautifully kept, and ready for their next small adventure.
          </p>
        </section>

        <FilterBar
          categories={categories.map((c) => ({ id: c.id, label: c.name }))}
          sizes={sizes.map((s) => ({ id: s.id, label: s.label }))}
          conditions={conditions.map((c) => ({ id: c.id, label: c.name }))}
          brands={brands.map((b) => ({ id: b.id, label: b.name }))}
          current={{ ...params, sort: str(sp, "sort") }}
        />

        {/* Results meta */}
        <div className="mb-5 flex items-baseline justify-between border-b border-line pb-3">
          <h2 className="font-display text-xl text-ink">The closet</h2>
          <span className="text-sm text-ink-soft">
            {total} {total === 1 ? "piece" : "pieces"}
          </span>
        </div>

        {listings.length === 0 ? (
          <div className="grid place-items-center rounded-[20px] border border-dashed border-line bg-surface/60 px-6 py-20 text-center">
            <p className="font-display text-2xl italic text-rose">
              Nothing here just yet.
            </p>
            <p className="mt-2 max-w-xs text-sm text-ink-soft">
              Try fewer filters, or check back soon — new little pieces arrive
              all the time.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
              {listings.map((l, i) => (
                <div
                  key={l.id}
                  className="rise-in"
                  style={{ animationDelay: `${Math.min(i, 10) * 55}ms` }}
                >
                  <ListingCard
                    listing={{
                      id: l.id,
                      title: l.title,
                      priceCents: l.priceCents,
                      brandName: l.brand?.name ?? null,
                      sizeLabel: l.size?.label ?? null,
                      conditionName: l.condition?.name ?? null,
                      imageUrl: l.images[0]?.url ?? null,
                    }}
                  />
                </div>
              ))}
            </div>

            {totalPages > 1 ? (
              <nav className="mt-14 flex items-center justify-between border-t border-line pt-6 text-sm">
                {page > 1 ? (
                  <a
                    className="rounded-full border border-line bg-surface px-5 py-2 text-ink shadow-[var(--shadow-card)] transition-colors hover:border-rose-soft hover:text-rose"
                    href={pageHref(sp, page - 1)}
                  >
                    ← Previous
                  </a>
                ) : (
                  <span />
                )}
                <span className="text-ink-soft">
                  Page <span className="font-display text-ink">{page}</span> of{" "}
                  <span className="font-display text-ink">{totalPages}</span>
                </span>
                {page < totalPages ? (
                  <a
                    className="rounded-full border border-line bg-surface px-5 py-2 text-ink shadow-[var(--shadow-card)] transition-colors hover:border-rose-soft hover:text-rose"
                    href={pageHref(sp, page + 1)}
                  >
                    Next →
                  </a>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-5 py-10 text-sm text-ink-soft sm:flex-row sm:items-center sm:px-8">
          <span className="font-display text-base text-ink">
            tiny<span className="italic text-rose">kloset</span>
          </span>
          <span>Pre-loved &amp; boutique kids&apos; fashion · worn once, loved twice.</span>
        </div>
      </footer>
    </>
  );
}
