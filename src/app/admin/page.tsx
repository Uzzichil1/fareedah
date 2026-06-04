import type { Metadata } from "next";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { centsToDollars } from "@/lib/money";
import { CurationActions } from "@/components/admin/CurationActions";

export const metadata: Metadata = { title: "Curation queue" };

export default async function AdminPage() {
  await requireAdmin(); // redirects non-admins to /

  const listings = await prisma.listing.findMany({
    where: { status: "PENDING_REVIEW" },
    orderBy: { createdAt: "asc" },
    include: {
      images: { orderBy: { position: "asc" } },
      storefront: { select: { name: true } },
      category: { select: { name: true } },
      condition: { select: { name: true } },
      size: { select: { label: true } },
    },
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Curation queue</h1>
      {listings.length === 0 ? (
        <p className="text-zinc-600">No listings awaiting review.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {listings.map((l) => (
            <li key={l.id} className="rounded border p-4">
              {l.images.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {l.images.map((img) => (
                    <Image key={img.id} src={img.url} alt="" width={64} height={64} className="rounded object-cover" />
                  ))}
                </div>
              )}
              <h2 className="font-medium">{l.title}</h2>
              <p className="text-sm text-zinc-500">
                ${centsToDollars(l.priceCents)} · {l.storefront.name}
              </p>
              <p className="text-sm text-zinc-500">
                {l.category.name} · {l.condition.name}
                {l.size ? ` · ${l.size.label}` : ""}
              </p>
              <p className="my-2 text-sm">{l.description}</p>
              <CurationActions listingId={l.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
