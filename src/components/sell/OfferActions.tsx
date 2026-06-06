"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToOffer } from "@/app/sell/offers/actions";
import { Button } from "@/components/ui/Button";

export function OfferActions({ bundleId }: { bundleId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function respond(accept: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await respondToOffer(bundleId, accept);
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <Button variant="sage" size="sm" disabled={pending} onClick={() => respond(true)}>
          Accept offer
        </Button>
        <Button variant="danger" size="sm" disabled={pending} onClick={() => respond(false)}>
          Decline
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
