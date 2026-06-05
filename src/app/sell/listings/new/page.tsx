import type { Metadata } from "next";
import { requireSeller } from "@/lib/dal";
import { getCategories, getConditions, getSizes } from "@/lib/taxonomy";
import { ListingForm } from "@/components/sell/ListingForm";
import { SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = { title: "New listing" };

export default async function NewListingPage() {
  await requireSeller();
  const [categories, conditions, sizes] = await Promise.all([
    getCategories(),
    getConditions(),
    getSizes(),
  ]);
  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-lg px-5 py-10 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">
          Add a piece
        </p>
        <h1 className="mt-1 font-display text-3xl text-ink">New listing</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          Save it as a draft anytime, or submit it for review when it&apos;s ready.
        </p>
        <div className="mt-8">
          <ListingForm
            categories={categories.map((c) => ({ id: c.id, label: c.parent ? `${c.parent.name} › ${c.name}` : c.name }))}
            conditions={conditions.map((c) => ({ id: c.id, label: c.name }))}
            sizes={sizes.map((s) => ({ id: s.id, label: s.label }))}
          />
        </div>
      </main>
    </>
  );
}
