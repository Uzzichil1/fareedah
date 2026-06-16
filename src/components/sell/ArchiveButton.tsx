"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveListing } from "@/app/sell/actions";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/inputs";

export function ArchiveButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function archive() {
    setError(null);
    startTransition(async () => {
      const r = await archiveListing(listingId);
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" disabled={pending} onClick={archive}>
        Archive
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
