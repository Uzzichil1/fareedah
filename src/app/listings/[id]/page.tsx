import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { centsToDollars } from "@/lib/money";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Badge } from "@/components/ui/Badge";
import { auth } from "@/auth";
import { AddToBagButton } from "@/components/bag/AddToBagButton";

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
      storefront: { select: { name: true, slug: true, userId: true } },
    },
  });
  if (!listing) notFound();

  const [hero, ...rest] = listing.images;

  const session = await auth();
  const viewerId = session?.user?.id ?? null;
  // Buyers (signed in) who don't own this listing can add it to a bag.
  const canAddToBag = !!viewerId && viewerId !== listing.storefront.userId;

  return (
    <>
      <SiteHeader />

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-rose"
        >
          <span aria-hidden>←</span> Back to the closet
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-2">
          {/* Gallery */}
          <div className="rise-in">
            {hero ? (
              <div className="overflow-hidden rounded-[18px] bg-surface ring-1 ring-line shadow-[var(--shadow-card)]">
                <Image
                  src={hero.url}
                  alt={listing.title}
                  width={900}
                  height={1125}
                  className="aspect-[4/5] w-full object-cover"
                  priority
                />
              </div>
            ) : (
              <div className="grid aspect-[4/5] w-full place-items-center rounded-[18px] bg-blush/50">
                <span className="font-display text-5xl italic text-rose-soft">tk</span>
              </div>
            )}
            {rest.length > 0 ? (
              <div className="mt-3 grid grid-cols-4 gap-3">
                {rest.map((img) => (
                  <div
                    key={img.id}
                    className="overflow-hidden rounded-[12px] bg-surface ring-1 ring-line"
                  >
                    <Image
                      src={img.url}
                      alt=""
                      width={220}
                      height={220}
                      className="aspect-square w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Details */}
          <div className="lg:pt-2">
            {listing.brand ? (
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">
                {listing.brand.name}
              </p>
            ) : null}
            <h1 className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl">
              {listing.title}
            </h1>
            <p className="mt-3 font-display text-2xl text-rose">
              ${centsToDollars(listing.priceCents)}
            </p>

            {canAddToBag && (
              <div className="mt-5">
                <AddToBagButton listingId={listing.id} />
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge tone="neutral">{listing.category.name}</Badge>
              <Badge tone="sage">{listing.condition.name}</Badge>
              {listing.size ? <Badge tone="neutral">Size {listing.size.label}</Badge> : null}
            </div>

            <div className="my-7 h-px bg-line" />

            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink/90">
              {listing.description}
            </p>

            <div className="mt-8 rounded-2xl border border-line bg-surface/70 p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-ink-soft">Sold by</p>
              <Link
                href={`/store/${listing.storefront.slug}`}
                className="mt-1 inline-block font-display text-lg text-ink transition-colors hover:text-rose"
              >
                {listing.storefront.name}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
