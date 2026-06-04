import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSeller } from "@/lib/dal";
import { getCategories, getConditions, getSizes } from "@/lib/taxonomy";
import { centsToDollars } from "@/lib/money";
import { ListingForm } from "@/components/sell/ListingForm";

export const metadata: Metadata = { title: "Edit listing" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { storefrontId } = await requireSeller();
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { images: { orderBy: { position: "asc" } }, brand: true },
  });
  if (!listing || listing.storefrontId !== storefrontId) notFound();

  const [categories, conditions, sizes] = await Promise.all([
    getCategories(),
    getConditions(),
    getSizes(),
  ]);

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-2xl font-semibold">Edit listing</h1>
      <p className="mb-2 text-sm text-zinc-500">Status: {listing.status}</p>
      {listing.status === "REJECTED" && listing.rejectionReason && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-700">
          Rejected: {listing.rejectionReason}
        </p>
      )}
      <ListingForm
        listingId={listing.id}
        categories={categories.map((c) => ({ id: c.id, label: c.parent ? `${c.parent.name} › ${c.name}` : c.name }))}
        conditions={conditions.map((c) => ({ id: c.id, label: c.name }))}
        sizes={sizes.map((s) => ({ id: s.id, label: s.label }))}
        initial={{
          title: listing.title,
          description: listing.description,
          priceDollars: centsToDollars(listing.priceCents),
          categoryId: listing.categoryId,
          conditionId: listing.conditionId,
          sizeId: listing.sizeId ?? "",
          brand: listing.brand?.name ?? "",
          images: listing.images.map((i) => ({ url: i.url, publicId: i.publicId ?? "", position: i.position })),
        }}
      />
    </main>
  );
}
