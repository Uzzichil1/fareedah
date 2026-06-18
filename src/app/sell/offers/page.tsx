import type { Metadata } from "next";
import Image from "next/image";
import { requireSeller } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { centsToDollars } from "@/lib/money";
import { listedTotalCents } from "@/lib/bundle";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Badge } from "@/components/ui/Badge";
import { OfferActions } from "@/components/sell/OfferActions";

export const metadata: Metadata = { title: "Offers" };

export default async function SellOffersPage() {
  const { storefrontId } = await requireSeller();

  const offers = await prisma.bundle.findMany({
    where: { storefrontId, status: "SUBMITTED" },
    orderBy: { updatedAt: "asc" },
    include: {
      buyer: { select: { name: true, email: true } },
      items: {
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              priceCents: true,
              status: true,
              images: { orderBy: { position: "asc" }, take: 1 },
            },
          },
        },
      },
    },
  });

  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">Seller</p>
            <h1 className="mt-1 font-display text-3xl text-ink">Offers</h1>
          </div>
          <Badge tone="rose">{offers.length} pending</Badge>
        </div>

        {offers.length === 0 ? (
          <div className="grid place-items-center rounded-[20px] border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
            <p className="font-display text-xl italic text-rose">No pending offers.</p>
            <p className="mt-2 text-sm text-ink-soft">Offers from buyers will appear here.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-6">
            {offers.map((b) => {
              const listed = listedTotalCents(
                b.items.map((i) => ({ priceCents: i.listing.priceCents, isLive: i.listing.status === "LIVE" })),
              );
              return (
                <li key={b.id} className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
                  <p className="text-sm text-ink-soft">
                    From {b.buyer.name ?? b.buyer.email}
                  </p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {b.items.map((it) => (
                      <li key={it.listing.id} className="flex items-center gap-3">
                        {it.listing.images[0] ? (
                          <Image
                            src={it.listing.images[0].url}
                            alt=""
                            width={44}
                            height={44}
                            className="h-11 w-11 rounded-lg object-cover ring-1 ring-line"
                          />
                        ) : (
                          <div className="h-11 w-11 rounded-lg bg-blush/50" />
                        )}
                        <span className="flex-1 text-sm text-ink">{it.listing.title}</span>
                        <span className="text-sm text-ink-soft">${centsToDollars(it.listing.priceCents)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
                    <span className="text-sm text-ink-soft">Listed total</span>
                    <span className="font-display text-lg text-ink">${centsToDollars(listed)}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-sm text-ink-soft">Offered</span>
                    <span className="font-display text-lg text-rose-deep">
                      ${centsToDollars(b.offerCents ?? 0)}
                    </span>
                  </div>
                  <OfferActions bundleId={b.id} />
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
