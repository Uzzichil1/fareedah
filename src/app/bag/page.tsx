import Image from "next/image";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { centsToDollars } from "@/lib/money";
import { listedTotalCents, ACTIVE_BUNDLE_STATUSES } from "@/lib/bundle";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Badge } from "@/components/ui/Badge";
import { BagControls } from "@/components/bag/BagControls";

export const metadata = { title: "Your bag" };

const OFFER_BADGE: Record<string, { tone: "neutral" | "sage" | "rose" | "danger"; label: string }> = {
  OPEN: { tone: "neutral", label: "In bag" },
  SUBMITTED: { tone: "rose", label: "Offer sent" },
  ACCEPTED: { tone: "sage", label: "Offer accepted" },
  DECLINED: { tone: "danger", label: "Offer declined" },
};

export default async function BagPage() {
  const { userId } = await verifySession();

  const bundles = await prisma.bundle.findMany({
    where: { buyerId: userId, status: { in: [...ACTIVE_BUNDLE_STATUSES] } },
    orderBy: { updatedAt: "desc" },
    include: {
      storefront: { select: { name: true, slug: true } },
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
        <h1 className="mb-8 font-display text-3xl text-ink">Your bag</h1>

        {bundles.length === 0 ? (
          <div className="grid place-items-center rounded-[20px] border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
            <p className="font-display text-xl italic text-rose">Your bag is empty.</p>
            <p className="mt-2 text-sm text-ink-soft">
              Browse the closet and add pieces you love.
            </p>
            <Link href="/" className="mt-4 text-sm font-semibold text-rose-deep hover:underline">
              Start browsing
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-6">
            {bundles.map((b) => {
              const listed = listedTotalCents(
                b.items.map((i) => ({ priceCents: i.listing.priceCents, isLive: i.listing.status === "LIVE" })),
              );
              const badge = OFFER_BADGE[b.status] ?? OFFER_BADGE.OPEN;
              return (
                <li key={b.id} className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link
                      href={`/store/${b.storefront.slug}`}
                      className="font-display text-lg text-ink hover:text-rose"
                    >
                      {b.storefront.name}
                    </Link>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </div>

                  <ul className="mt-3 flex flex-col gap-2">
                    {b.items.map((it) => {
                      const live = it.listing.status === "LIVE";
                      return (
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
                          <span className={`flex-1 text-sm ${live ? "text-ink" : "text-ink-soft line-through"}`}>
                            {it.listing.title}
                            {!live && " — no longer available"}
                          </span>
                          <span className="text-sm text-ink-soft">
                            ${centsToDollars(it.listing.priceCents)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
                    <span className="text-sm text-ink-soft">Listed total</span>
                    <span className="font-display text-lg text-ink">${centsToDollars(listed)}</span>
                  </div>
                  {b.offerCents != null && (b.status === "SUBMITTED" || b.status === "ACCEPTED") && (
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-sm text-ink-soft">Your offer</span>
                      <span className="font-display text-lg text-rose-deep">${centsToDollars(b.offerCents)}</span>
                    </div>
                  )}

                  <BagControls
                    bundleId={b.id}
                    status={b.status}
                    items={b.items.map((it) => ({ listingId: it.listing.id, title: it.listing.title }))}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
