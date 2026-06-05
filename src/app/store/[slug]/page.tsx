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
