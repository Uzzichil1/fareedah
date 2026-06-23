"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSeller } from "@/lib/dal";
import { stripe, APP_ORIGIN } from "@/lib/stripe";

export type ActionResult = { error: string } | undefined;

/**
 * Ensure the caller's storefront has a Stripe Express account, then mint a
 * single-use onboarding Account Link and return its URL for the client to
 * redirect to. Account Links expire, so we always create a fresh one.
 */
export async function startStripeOnboarding(): Promise<{ url: string } | { error: string }> {
  const { storefrontId } = await requireSeller();
  const storefront = await prisma.storefront.findUnique({ where: { id: storefrontId } });
  if (!storefront) return { error: "No storefront found." };

  try {
    let accountId = storefront.stripeAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create({ type: "express" });
      accountId = account.id;
      // Persist scoped to this storefront (ownership already verified).
      await prisma.storefront.update({
        where: { id: storefront.id },
        data: { stripeAccountId: accountId },
      });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${APP_ORIGIN}/sell/payouts/refresh`,
      return_url: `${APP_ORIGIN}/sell/payouts/return`,
      type: "account_onboarding",
    });
    return { url: link.url };
  } catch (err) {
    console.error("startStripeOnboarding failed:", err);
    return { error: "Could not start payout setup. Please try again." };
  }
}

/**
 * Retrieve the connected account from Stripe and sync the stored
 * charges/payouts flags. Safe no-op if no account exists yet.
 */
export async function refreshOnboardingStatus(): Promise<ActionResult> {
  const { storefrontId } = await requireSeller();
  const storefront = await prisma.storefront.findUnique({ where: { id: storefrontId } });
  if (!storefront?.stripeAccountId) return undefined;

  try {
    const account = await stripe.accounts.retrieve(storefront.stripeAccountId);
    await prisma.storefront.update({
      where: { id: storefront.id },
      data: {
        stripeChargesEnabled: account.charges_enabled ?? false,
        stripePayoutsEnabled: account.payouts_enabled ?? false,
      },
    });
    revalidatePath("/sell/payouts");
    revalidatePath("/sell");
    return undefined;
  } catch (err) {
    console.error("refreshOnboardingStatus failed:", err);
    return { error: "Could not refresh payout status. Please try again." };
  }
}
