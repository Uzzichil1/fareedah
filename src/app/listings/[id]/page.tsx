import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { centsToDollars } from "@/lib/money";

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
      storefront: { select: { name: true, slug: true } },
    },
  });
  if (!listing) notFound();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/" className="text-sm text-pink-600 hover:underline">&larr; Back to browse</Link>
      <div className="mt-3 flex flex-wrap gap-2">
        {listing.images.map((img) => (
          <Image key={img.id} src={img.url} alt="" width={200} height={200} className="rounded object-cover" />
        ))}
      </div>
      <h1 className="mt-4 text-2xl font-semibold">{listing.title}</h1>
      <p className="text-lg text-zinc-700">${centsToDollars(listing.priceCents)}</p>
      <p className="mt-1 text-sm text-zinc-500">
        {listing.category.name} · {listing.condition.name}
        {listing.size ? ` · ${listing.size.label}` : ""}
        {listing.brand ? ` · ${listing.brand.name}` : ""}
      </p>
      <p className="mt-4 whitespace-pre-wrap">{listing.description}</p>
      <p className="mt-6 text-sm">
        Sold by{" "}
        <Link href={`/store/${listing.storefront.slug}`} className="text-pink-600 hover:underline">
          {listing.storefront.name}
        </Link>
      </p>
    </main>
  );
}
