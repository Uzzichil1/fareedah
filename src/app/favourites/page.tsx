import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { partitionFavorites } from "@/lib/favorites";
import { ListingCard } from "@/components/listings/ListingCard";
import { SiteHeader } from "@/components/site/SiteHeader";

export default async function FavouritesPage() {
  const { userId } = await verifySession();

  const favorites = await prisma.favorite.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      listing: {
        include: {
          images: { orderBy: { position: "asc" }, take: 1 },
          brand: { select: { name: true } },
          size: { select: { label: true } },
          condition: { select: { name: true } },
        },
      },
    },
  });

  const { available, unavailable } = partitionFavorites(favorites);

  const toCard = (f: (typeof favorites)[number]) => ({
    id: f.listing.id,
    title: f.listing.title,
    priceCents: f.listing.priceCents,
    brandName: f.listing.brand?.name ?? null,
    sizeLabel: f.listing.size?.label ?? null,
    conditionName: f.listing.condition?.name ?? null,
    imageUrl: f.listing.images[0]?.url ?? null,
  });

  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        <div className="mb-5 flex items-baseline justify-between border-b border-line pb-3 pt-10">
          <h1 className="font-display text-2xl text-ink">Favourites</h1>
          <span className="text-sm text-ink-soft">
            {favorites.length} {favorites.length === 1 ? "item" : "items"}
          </span>
        </div>

        {favorites.length === 0 ? (
          <div className="grid place-items-center rounded-[20px] border border-dashed border-line bg-surface/60 px-6 py-20 text-center">
            <p className="font-display text-2xl italic text-rose">No favourites yet.</p>
            <p className="mt-2 max-w-xs text-sm text-ink-soft">
              Tap the heart on anything you love and it will be saved here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
            {available.map((f) => (
              <ListingCard key={f.id} isAuthenticated isFavorited listing={toCard(f)} />
            ))}
            {unavailable.map((f) => (
              <ListingCard key={f.id} isAuthenticated isFavorited unavailable listing={toCard(f)} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
