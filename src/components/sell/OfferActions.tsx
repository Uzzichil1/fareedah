"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToOffer, counterOffer } from "@/app/sell/offers/actions";
import { Button } from "@/components/ui/Button";
import { Input, FieldError } from "@/components/ui/inputs";

export function OfferActions({ bundleId }: { bundleId: string }) {
  const router = useRouter();
  const [counter, setCounter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error: string } | undefined>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <Button variant="sage" size="sm" disabled={pending} onClick={() => run(() => respondToOffer(bundleId, true))}>
          Accept offer
        </Button>
        <Button variant="danger" size="sm" disabled={pending} onClick={() => run(() => respondToOffer(bundleId, false))}>
          Decline
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={counter}
          onChange={(e) => setCounter(e.target.value)}
          placeholder="Counter (USD)"
          aria-label="Counter amount in USD"
          inputMode="decimal"
          className="max-w-[10rem]"
        />
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => counterOffer(bundleId, counter))}>
          Counter
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
