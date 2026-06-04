"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveListing, rejectListing } from "@/app/admin/actions";

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
    <div className="mt-2 flex flex-col gap-2">
      <button onClick={approve} disabled={pending} className="self-start rounded bg-green-600 px-3 py-1 text-white">
        Approve
      </button>
      <div className="flex gap-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for rejection"
          className="flex-1 rounded border p-1"
        />
        <button onClick={reject} disabled={pending} className="rounded bg-red-600 px-3 py-1 text-white">
          Reject
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
