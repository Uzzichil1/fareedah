// src/components/listings/ListingCard.tsx
import Link from "next/link";
import Image from "next/image";
import { centsToDollars } from "@/lib/money";
import { FavoriteButton } from "@/components/listings/FavoriteButton";

export type ListingCardData = {
  id: string;
  title: string;
  priceCents: number;
  brandName: string | null;
  sizeLabel: string | null;
  conditionName: string | null;
  imageUrl: string | null;
};

/**
 * Product card. The whole card is a single click target via a stretched link
 * (`absolute inset-0`, z-10); the optional favourite heart sits above it
 * (z-20) as a sibling — never nested inside the anchor. When `unavailable`,
 * the card is non-navigable (no link) and dimmed with an overlay label.
 */
export function ListingCard({
  listing,
  isFavorited,
  isAuthenticated,
  unavailable = false,
}: {
  listing: ListingCardData;
  isFavorited?: boolean;
  isAuthenticated?: boolean;
  unavailable?: boolean;
}) {
  // The heart renders only when a caller opts in by passing isAuthenticated.
  const showHeart = isAuthenticated !== undefined;

  return (
    <div className="group relative">
      <div className="relative overflow-hidden rounded-[14px] bg-surface ring-1 ring-line shadow-[var(--shadow-card)] transition-shadow duration-500 group-hover:shadow-[var(--shadow-lift)]">
        {listing.imageUrl ? (
          <Image
            src={listing.imageUrl}
            alt={listing.title}
            width={480}
            height={600}
            className={`aspect-[4/5] w-full object-cover transition-transform duration-700 ease-out ${
              unavailable ? "opacity-60" : "group-hover:scale-[1.045]"
            }`}
          />
        ) : (
          <div className={`grid aspect-[4/5] w-full place-items-center bg-blush/50 ${unavailable ? "opacity-60" : ""}`}>
            <span className="font-display text-3xl italic text-rose-soft">tk</span>
          </div>
        )}

        {listing.conditionName && !unavailable ? (
          <span className="absolute left-3 top-3 rounded-full bg-sage-soft/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sage backdrop-blur-sm">
            {listing.conditionName}
          </span>
        ) : null}

        {unavailable ? (
          <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-ink">
            <span className="rounded-full bg-paper/90 px-3 py-1.5 backdrop-blur-sm">No longer available</span>
          </span>
        ) : null}
      </div>

      {/* Stretched link — covers the whole card, sits beneath the heart. */}
      {!unavailable ? (
        <Link
          href={`/listings/${listing.id}`}
          aria-label={listing.title}
          className="absolute inset-0 z-10 rounded-[14px]"
        />
      ) : null}

      {/* Favourite heart — sibling of the link, above it. */}
      {showHeart ? (
        <div className="absolute right-3 top-3 z-20">
          <FavoriteButton
            key={listing.id}
            listingId={listing.id}
            initialFavorited={!!isFavorited}
            isAuthenticated={!!isAuthenticated}
          />
        </div>
      ) : null}

      <div className="mt-3 px-0.5">
        {listing.brandName ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
            {listing.brandName}
          </p>
        ) : null}
        <p className="mt-0.5 truncate text-[15px] leading-snug text-ink">{listing.title}</p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="font-display text-lg text-ink">${centsToDollars(listing.priceCents)}</span>
          {listing.sizeLabel ? <span className="text-xs text-ink-soft">{listing.sizeLabel}</span> : null}
        </div>
      </div>
    </div>
  );
}
