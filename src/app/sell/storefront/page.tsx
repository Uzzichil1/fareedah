import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSeller } from "@/lib/dal";
import { StorefrontEditForm } from "@/components/sell/StorefrontEditForm";
import { SiteHeader } from "@/components/site/SiteHeader";

export const metadata: Metadata = { title: "Edit storefront" };

export default async function SellStorefrontPage() {
  const { storefrontId } = await requireSeller();
  const storefront = await prisma.storefront.findUnique({
    where: { id: storefrontId },
    select: { name: true, bio: true, avatarUrl: true, bannerUrl: true },
  });
  if (!storefront) redirect("/sell/start");

  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-md px-5 py-12 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">
          Your storefront
        </p>
        <h1 className="mt-1 font-display text-3xl text-ink">Edit storefront</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          Update your shop&apos;s name, bio, avatar, and banner. Your storefront
          link stays the same.
        </p>
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <StorefrontEditForm initial={storefront} />
        </div>
      </main>
    </>
  );
}
