import Link from "next/link";
import Image from "next/image";
import { centsToDollars } from "@/lib/money";

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
 * Editorial product card: a tall framed image with a slow hover zoom, a small
 * letterspaced brand eyebrow, the title in body type, and the price set in the
 * display serif. Condition rides as a soft sage chip on the image.
 */
export function ListingCard({ listing }: { listing: ListingCardData }) {
  return (
    <Link href={`/listings/${listing.id}`} className="group block">
      <div className="relative overflow-hidden rounded-[14px] bg-surface ring-1 ring-line shadow-[var(--shadow-card)] transition-shadow duration-500 group-hover:shadow-[var(--shadow-lift)]">
        {listing.imageUrl ? (
          <Image
            src={listing.imageUrl}
            alt={listing.title}
            width={480}
            height={600}
            className="aspect-[4/5] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.045]"
          />
        ) : (
          <div className="grid aspect-[4/5] w-full place-items-center bg-blush/50">
            <span className="font-display text-3xl italic text-rose-soft">
              tk
            </span>
          </div>
        )}

        {listing.conditionName ? (
          <span className="absolute left-3 top-3 rounded-full bg-sage-soft/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sage backdrop-blur-sm">
            {listing.conditionName}
          </span>
        ) : null}
      </div>

      <div className="mt-3 px-0.5">
        {listing.brandName ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
            {listing.brandName}
          </p>
        ) : null}
        <p className="mt-0.5 truncate text-[15px] leading-snug text-ink">
          {listing.title}
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="font-display text-lg text-ink">
            ${centsToDollars(listing.priceCents)}
          </span>
          {listing.sizeLabel ? (
            <span className="text-xs text-ink-soft">{listing.sizeLabel}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
