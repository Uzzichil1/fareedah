import type { Metadata } from "next";
import { requireSeller } from "@/lib/dal";
import { getCategories, getConditions, getSizes } from "@/lib/taxonomy";
import { ListingForm } from "@/components/sell/ListingForm";

export const metadata: Metadata = { title: "New listing" };

export default async function NewListingPage() {
  await requireSeller();
  const [categories, conditions, sizes] = await Promise.all([
    getCategories(),
    getConditions(),
    getSizes(),
  ]);
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-2xl font-semibold">New listing</h1>
      <ListingForm
        categories={categories.map((c) => ({ id: c.id, label: c.parent ? `${c.parent.name} › ${c.name}` : c.name }))}
        conditions={conditions.map((c) => ({ id: c.id, label: c.name }))}
        sizes={sizes.map((s) => ({ id: s.id, label: s.label }))}
      />
    </main>
  );
}
