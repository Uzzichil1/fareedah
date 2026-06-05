import { notFound } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { ListingCard } from "@/components/listings/ListingCard";
import { SiteHeader } from "@/components/site/SiteHeader";

export default async function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const storefront = await prisma.storefront.findUnique({
    where: { slug },
    include: {
      listings: {
        where: { status: "LIVE" }, // only LIVE listings are public
        orderBy: { createdAt: "desc" },
        include: {
          images: { orderBy: { position: "asc" }, take: 1 },
          brand: { select: { name: true } },
          size: { select: { label: true } },
          condition: { select: { name: true } },
        },
      },
    },
  });
  if (!storefront) notFound();

  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        {/* Storefront banner */}
        <div className="relative mt-4 h-40 overflow-hidden rounded-[20px] bg-blush ring-1 ring-line sm:h-52">
          {storefront.bannerUrl ? (
            <Image
              src={storefront.bannerUrl}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 1152px) 100vw, 1152px"
            />
          ) : (
            <div
              aria-hidden
              className="h-full w-full bg-[radial-gradient(120%_120%_at_20%_0%,var(--color-blush),var(--color-sage-soft))]"
            />
          )}
        </div>

        {/* Identity */}
        <header className="-mt-10 flex flex-col items-center px-4 text-center sm:-mt-12">
          <div className="h-24 w-24 overflow-hidden rounded-full bg-surface ring-4 ring-paper shadow-[var(--shadow-lift)]">
            {storefront.avatarUrl ? (
              <Image
                src={storefront.avatarUrl}
                alt={storefront.name}
                width={96}
                height={96}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-blush/60">
                <span className="font-display text-2xl italic text-rose">
                  {storefront.name.charAt(0)}
                </span>
              </div>
            )}
          </div>
          <h1 className="mt-4 font-display text-3xl text-ink">{storefront.name}</h1>
          {storefront.bio ? (
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-soft">
              {storefront.bio}
            </p>
          ) : null}
        </header>

        {/* Listings */}
        <div className="mb-5 mt-10 flex items-baseline justify-between border-b border-line pb-3">
          <h2 className="font-display text-xl text-ink">For sale</h2>
          <span className="text-sm text-ink-soft">
            {storefront.listings.length}{" "}
            {storefront.listings.length === 1 ? "piece" : "pieces"}
          </span>
        </div>

        {storefront.listings.length === 0 ? (
          <div className="grid place-items-center rounded-[20px] border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
            <p className="font-display text-xl italic text-rose">No items for sale right now.</p>
            <p className="mt-2 text-sm text-ink-soft">Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
            {storefront.listings.map((l, i) => (
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
        )}
      </main>
    </>
  );
}
