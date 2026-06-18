import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSeller } from "@/lib/dal";
import { getCategories, getConditions, getSizes } from "@/lib/taxonomy";
import { centsToDollars } from "@/lib/money";
import { ListingForm } from "@/components/sell/ListingForm";
import { SiteHeader } from "@/components/site/SiteHeader";

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
    <>
      <SiteHeader />

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-lg px-5 py-10 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">
          Edit piece
        </p>
        <h1 className="mt-1 font-display text-3xl text-ink">Edit listing</h1>

        {listing.status === "REJECTED" && listing.rejectionReason ? (
          <div className="mt-5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
            <span className="font-semibold">Rejected:</span> {listing.rejectionReason}
          </div>
        ) : null}

        <div className="mt-8">
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
        </div>
      </main>
    </>
  );
}
