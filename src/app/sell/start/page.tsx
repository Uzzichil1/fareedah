import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifySession } from "@/lib/dal";
import { StorefrontForm } from "@/components/sell/StorefrontForm";
import { SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = { title: "Open your storefront" };

export default async function SellStartPage() {
  const { userId } = await verifySession();
  const existing = await prisma.storefront.findUnique({ where: { userId } });
  if (existing) redirect("/sell");

  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-md px-5 py-12 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">
          Become a seller
        </p>
        <h1 className="mt-1 font-display text-3xl text-ink">Open your storefront</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          Give your little shop a name and a few words. You can start listing
          pieces the moment it&apos;s open.
        </p>
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <StorefrontForm />
        </div>
      </main>
    </>
  );
}
