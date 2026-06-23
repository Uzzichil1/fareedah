"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startStripeOnboarding, refreshOnboardingStatus } from "@/app/sell/payouts/actions";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/inputs";
import type { OnboardingState } from "@/lib/stripe-onboarding";

export function PayoutsPanel({ state }: { state: OnboardingState }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function begin() {
    setError(null);
    startTransition(async () => {
      const r = await startStripeOnboarding();
      if ("error" in r) setError(r.error);
      else window.location.href = r.url; // redirect to Stripe-hosted onboarding
    });
  }

  function refresh() {
    setError(null);
    startTransition(async () => {
      const r = await refreshOnboardingStatus();
      if (r?.error) setError(r.error);
      else router.refresh(); // re-fetch the server component with synced flags
    });
  }

  if (state === "enabled") {
    return (
      <p className="text-sm font-semibold text-sage">Payouts enabled — you&apos;re ready to get paid.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={begin} disabled={pending}>
        {pending ? "Working…" : state === "incomplete" ? "Continue setup" : "Set up payouts"}
      </Button>
      {state === "incomplete" && (
        <Button variant="secondary" size="sm" onClick={refresh} disabled={pending} className="self-start">
          Refresh status
        </Button>
      )}
      <FieldError>{error}</FieldError>
    </div>
  );
}
