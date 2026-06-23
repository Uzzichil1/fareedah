import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { requireSeller } from "@/lib/dal";
import { centsToDollars } from "@/lib/money";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { ArchiveButton } from "@/components/sell/ArchiveButton";
import { onboardingState } from "@/lib/stripe-onboarding";

export const metadata: Metadata = { title: "Your listings" };

type ListingStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "LIVE"
  | "SOLD"
  | "ARCHIVED";

const STATUS: Record<ListingStatus, { tone: "neutral" | "sage" | "rose" | "danger" | "ink"; label: string }> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  PENDING_REVIEW: { tone: "rose", label: "In review" },
  APPROVED: { tone: "sage", label: "Approved" },
  REJECTED: { tone: "danger", label: "Rejected" },
  LIVE: { tone: "sage", label: "Live" },
  SOLD: { tone: "ink", label: "Sold" },
  ARCHIVED: { tone: "neutral", label: "Archived" },
};

export default async function SellDashboardPage() {
  const { storefrontId } = await requireSeller();
  const storefront = await prisma.storefront.findUniqueOrThrow({
    where: { id: storefrontId },
    select: { stripeAccountId: true, stripeChargesEnabled: true, stripePayoutsEnabled: true },
  });
  const payoutState = onboardingState({
    hasAccount: !!storefront.stripeAccountId,
    chargesEnabled: storefront.stripeChargesEnabled,
    payoutsEnabled: storefront.stripePayoutsEnabled,
  });
  const listings = await prisma.listing.findMany({
    where: { storefrontId },
    orderBy: { updatedAt: "desc" },
    include: { images: { orderBy: { position: "asc" }, take: 1 } },
  });

  return (
    <>
      <SiteHeader />

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">
              Your closet
            </p>
            <h1 className="mt-1 font-display text-3xl text-ink">Listings</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sell/storefront" className={buttonClasses("secondary", "md")}>
              Edit storefront
            </Link>
            <Link href="/sell/offers" className={buttonClasses("secondary", "md")}>
              Offers
            </Link>
            <Link href="/sell/listings/new" className={buttonClasses("primary", "md")}>
              + New listing
            </Link>
          </div>
        </div>

        {payoutState !== "enabled" && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-soft/60 bg-blush/40 px-5 py-4">
            <p className="text-sm text-ink">
              {payoutState === "incomplete"
                ? "Finish setting up payouts to receive money when your pieces sell."
                : "Set up payouts to receive money when your pieces sell."}
            </p>
            <Link href="/sell/payouts" className={buttonClasses("primary", "sm")}>
              {payoutState === "incomplete" ? "Continue setup" : "Set up payouts"}
            </Link>
          </div>
        )}

        {listings.length === 0 ? (
          <div className="grid place-items-center rounded-[20px] border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
            <p className="font-display text-xl italic text-rose">Your closet is empty.</p>
            <p className="mt-2 text-sm text-ink-soft">Create your first listing to get started.</p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
            {listings.map((l) => {
              const s = STATUS[l.status];
              return (
                <li
                  key={l.id}
                  className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-b-0"
                >
                  {l.images[0] ? (
                    <Image
                      src={l.images[0].url}
                      alt=""
                      width={52}
                      height={52}
                      className="h-13 w-13 rounded-lg object-cover ring-1 ring-line"
                    />
                  ) : (
                    <div className="grid h-13 w-13 place-items-center rounded-lg bg-blush/50">
                      <span className="font-display text-sm italic text-rose-soft">tk</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/sell/listings/${l.id}/edit`}
                      className="block truncate font-medium text-ink transition-colors hover:text-rose"
                    >
                      {l.title}
                    </Link>
                    <p className="text-sm text-ink-soft">${centsToDollars(l.priceCents)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge tone={s.tone}>{s.label}</Badge>
                    {l.status === "LIVE" && <ArchiveButton listingId={l.id} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
