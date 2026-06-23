import { redirect } from "next/navigation";
import { refreshOnboardingStatus } from "@/app/sell/payouts/actions";

// Stripe redirects the seller here when they finish (or exit) hosted onboarding.
// Sync the latest status, then send them to the payouts page to see the result.
export default async function PayoutsReturnPage() {
  await refreshOnboardingStatus();
  redirect("/sell/payouts");
}
