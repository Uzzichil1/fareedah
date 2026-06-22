"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeFromBundle,
  clearBundle,
  submitOffer,
  withdrawOffer,
  acceptCounter,
  declineCounter,
} from "@/app/bag/actions";
import { Button } from "@/components/ui/Button";
import { Input, FieldError } from "@/components/ui/inputs";

type Item = { listingId: string; title: string };

export function BagControls({
  bundleId,
  status,
  items,
}: {
  bundleId: string;
  status: "OPEN" | "SUBMITTED" | "COUNTERED" | "ACCEPTED" | "DECLINED" | "CHECKED_OUT";
  items: Item[];
}) {
  const router = useRouter();
  const [offer, setOffer] = useState("");
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

  const editable = status === "OPEN" || status === "DECLINED";

  return (
    <div className="mt-3 flex flex-col gap-3">
      {editable && (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <Button
              key={it.listingId}
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => run(() => removeFromBundle(bundleId, it.listingId))}
            >
              Remove {it.title}
            </Button>
          ))}
        </div>
      )}

      {editable && (
        <div className="flex items-center gap-2">
          <Input
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            placeholder="Offer (USD)"
            aria-label="Offer amount in USD"
            inputMode="decimal"
            className="max-w-[10rem]"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => run(() => submitOffer(bundleId, offer))}
          >
            Send offer
          </Button>
        </div>
      )}

      {status === "SUBMITTED" && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => withdrawOffer(bundleId))}
        >
          Withdraw offer
        </Button>
      )}

      {status === "COUNTERED" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button variant="sage" size="sm" disabled={pending} onClick={() => run(() => acceptCounter(bundleId))}>
              Accept counter
            </Button>
            <Button variant="danger" size="sm" disabled={pending} onClick={() => run(() => declineCounter(bundleId))}>
              Decline counter
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="Counter (USD)"
              aria-label="Counter amount in USD"
              inputMode="decimal"
              className="max-w-[10rem]"
            />
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => submitOffer(bundleId, offer))}>
              Counter
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          disabled
          title="Checkout arrives in Phase 4c"
        >
          Checkout (coming soon)
        </Button>
        {editable && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(() => clearBundle(bundleId))}
          >
            Clear bag
          </Button>
        )}
      </div>

      <FieldError>{error}</FieldError>
    </div>
  );
}
