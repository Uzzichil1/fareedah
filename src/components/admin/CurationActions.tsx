"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveListing, rejectListing } from "@/app/admin/actions";
import { Input, FieldError } from "@/components/ui/inputs";
import { Button } from "@/components/ui/Button";

export function CurationActions({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function approve() {
    setError(null);
    startTransition(async () => {
      const r = await approveListing(listingId);
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const r = await rejectListing(listingId, reason);
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for rejection (required to reject)"
          className="flex-1"
        />
        <Button onClick={reject} disabled={pending} variant="danger" size="sm">
          Reject
        </Button>
      </div>
      <Button onClick={approve} disabled={pending} variant="sage" size="sm" className="self-start">
        Approve &amp; publish
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
