import { redirect } from "next/navigation";
import { startStripeOnboarding } from "@/app/sell/payouts/actions";

// Stripe redirects here if the Account Link expired before completion. Mint a
// fresh link and bounce the seller back into Stripe-hosted onboarding. On error,
// fall back to the payouts page.
export default async function PayoutsRefreshPage() {
  const r = await startStripeOnboarding();
  if ("url" in r) redirect(r.url);
  redirect("/sell/payouts");
}
