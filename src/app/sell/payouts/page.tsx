import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireSeller } from "@/lib/dal";
import { onboardingState } from "@/lib/stripe-onboarding";
import { SiteHeader } from "@/components/site/SiteHeader";
import { PayoutsPanel } from "@/components/sell/PayoutsPanel";

export const metadata: Metadata = { title: "Payouts" };

export default async function PayoutsPage() {
  const { storefrontId } = await requireSeller();
  const storefront = await prisma.storefront.findUniqueOrThrow({ where: { id: storefrontId } });
  const state = onboardingState({
    hasAccount: !!storefront.stripeAccountId,
    chargesEnabled: storefront.stripeChargesEnabled,
    payoutsEnabled: storefront.stripePayoutsEnabled,
  });

  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-md px-5 py-12 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">Seller</p>
        <h1 className="mt-1 font-display text-3xl text-ink">Payouts</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          Connect a Stripe account so you can receive money when your pieces sell. Stripe handles
          identity and bank details securely.
        </p>
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <PayoutsPanel state={state} />
        </div>
      </main>
    </>
  );
}
