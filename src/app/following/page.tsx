import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { getFollowedStorefrontIds } from "@/lib/follows-data";
import { followingFeedWhere } from "@/lib/follows";
import { getFavoritedListingIds } from "@/lib/favorites-data";
import { PAGE_SIZE } from "@/lib/listing-query";
import { ListingCard } from "@/components/listings/ListingCard";
import { SiteHeader } from "@/components/site/SiteHeader";

type SP = Record<string, string | string[] | undefined>;

function pageHref(page: number): string {
  return `/following?page=${page}`;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid place-items-center rounded-[20px] border border-dashed border-line bg-surface/60 px-6 py-20 text-center">
      <p className="font-display text-2xl italic text-rose">{title}</p>
      <p className="mt-2 max-w-xs text-sm text-ink-soft">{body}</p>
    </div>
  );
}

export default async function FollowingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { userId } = await verifySession();
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);

  const followedIds = await getFollowedStorefrontIds(userId);

  let listings: Awaited<ReturnType<typeof loadFeed>>["listings"] = [];
  let total = 0;
  if (followedIds.length > 0) {
    const feed = await loadFeed(followedIds, page);
    listings = feed.listings;
    total = feed.total;
  }
  const favIds =
    listings.length > 0 ? await getFavoritedListingIds(userId, listings.map((l) => l.id)) : new Set<string>();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        <div className="mb-5 flex items-baseline justify-between border-b border-line pb-3 pt-10">
          <h1 className="font-display text-2xl text-ink">Following</h1>
          <span className="text-sm text-ink-soft">
            {total} {total === 1 ? "piece" : "pieces"}
          </span>
        </div>

        {followedIds.length === 0 ? (
          <EmptyState
            title="You're not following any shops yet."
            body="Follow a shop to see their new arrivals here."
          />
        ) : total === 0 ? (
          <EmptyState
            title="Nothing new just yet."
            body="The shops you follow have no items for sale right now."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
              {listings.map((l, i) => (
                <div key={l.id} className="rise-in" style={{ animationDelay: `${Math.min(i, 10) * 55}ms` }}>
                  <ListingCard
                    isAuthenticated
                    isFavorited={favIds.has(l.id)}
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
                  <a className="rounded-full border border-line bg-surface px-5 py-2 text-ink shadow-[var(--shadow-card)] transition-colors hover:border-rose-soft hover:text-rose" href={pageHref(page - 1)}>
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
                  <a className="rounded-full border border-line bg-surface px-5 py-2 text-ink shadow-[var(--shadow-card)] transition-colors hover:border-rose-soft hover:text-rose" href={pageHref(page + 1)}>
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
    </>
  );
}

async function loadFeed(followedIds: string[], page: number) {
  const where = followingFeedWhere(followedIds);
  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
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
  ]);
  return { listings, total };
}
