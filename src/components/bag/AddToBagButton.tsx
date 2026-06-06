"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToBundle } from "@/app/bag/actions";
import { Button } from "@/components/ui/Button";

export function AddToBagButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const r = await addToBundle(listingId);
      if (r?.error) {
        setError(r.error);
      } else {
        setAdded(true);
        router.push("/bag");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={add} disabled={pending || added}>
        {added ? "Added to bag" : pending ? "Adding…" : "Add to bag"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
