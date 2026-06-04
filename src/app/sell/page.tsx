import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { requireSeller } from "@/lib/dal";
import { centsToDollars } from "@/lib/money";

export const metadata: Metadata = { title: "Your listings" };

export default async function SellDashboardPage() {
  const { storefrontId } = await requireSeller();
  const listings = await prisma.listing.findMany({
    where: { storefrontId },
    orderBy: { updatedAt: "desc" },
    include: { images: { orderBy: { position: "asc" }, take: 1 } },
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your listings</h1>
        <Link href="/sell/listings/new" className="rounded bg-pink-600 px-3 py-2 text-white">
          New listing
        </Link>
      </div>
      {listings.length === 0 ? (
        <p className="text-zinc-600">No listings yet. Create your first one.</p>
      ) : (
        <ul className="divide-y">
          {listings.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-3">
              {l.images[0] ? (
                <Image src={l.images[0].url} alt="" width={48} height={48} className="rounded object-cover" />
              ) : (
                <div className="h-12 w-12 rounded bg-zinc-100" />
              )}
              <div className="flex-1">
                <Link href={`/sell/listings/${l.id}/edit`} className="font-medium hover:underline">
                  {l.title}
                </Link>
                <p className="text-sm text-zinc-500">${centsToDollars(l.priceCents)}</p>
              </div>
              <span className="rounded bg-zinc-100 px-2 py-1 text-xs">{l.status}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
