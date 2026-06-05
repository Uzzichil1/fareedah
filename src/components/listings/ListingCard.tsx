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
