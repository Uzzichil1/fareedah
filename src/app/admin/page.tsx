import type { Metadata } from "next";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { centsToDollars } from "@/lib/money";
import { CurationActions } from "@/components/admin/CurationActions";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Badge } from "@/components/ui/Badge";

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
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">Admin</p>
            <h1 className="mt-1 font-display text-3xl text-ink">Curation queue</h1>
          </div>
          <Badge tone="rose">
            {listings.length} pending
          </Badge>
        </div>

        {listings.length === 0 ? (
          <div className="grid place-items-center rounded-[20px] border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
            <p className="font-display text-xl italic text-rose">The queue is clear.</p>
            <p className="mt-2 text-sm text-ink-soft">No listings awaiting review.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-6">
            {listings.map((l) => (
              <li
                key={l.id}
                className="rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]"
              >
                {l.images.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {l.images.map((img) => (
                      <Image
                        key={img.id}
                        src={img.url}
                        alt=""
                        width={84}
                        height={84}
                        className="h-21 w-21 rounded-xl object-cover ring-1 ring-line"
                      />
                    ))}
                  </div>
                )}
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-lg text-ink">{l.title}</h2>
                  <span className="font-display text-lg text-rose">
                    ${centsToDollars(l.priceCents)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  {l.storefront.name} · {l.category.name} · {l.condition.name}
                  {l.size ? ` · ${l.size.label}` : ""}
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
                  {l.description}
                </p>
                <div className="mt-4 border-t border-line pt-4">
                  <CurationActions listingId={l.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
