// src/components/listings/FavoriteButton.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleFavorite } from "@/app/favourites/actions";

type Props = {
  listingId: string;
  initialFavorited: boolean;
  isAuthenticated: boolean;
  variant?: "overlay" | "inline";
};

export function FavoriteButton({
  listingId,
  initialFavorited,
  isAuthenticated,
  variant = "overlay",
}: Props) {
  const router = useRouter();
  // Local optimistic state. Intentionally NOT derived from initialFavorited on
  // re-render — the component is keyed by listingId, so a different listing
  // remounts with fresh state; reconciliation happens via router.refresh().
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    const next = !favorited;
    setFavorited(next); // optimistic
    startTransition(async () => {
      const r = await toggleFavorite(listingId);
      if ("error" in r) {
        setFavorited(!next); // revert
      } else {
        setFavorited(r.favorited);
        router.refresh(); // reconcile server state (drops items from /favourites)
      }
    });
  }

  const label = favorited ? "Remove from favourites" : "Add to favourites";

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={favorited}
        aria-label={label}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink transition-colors hover:border-rose-soft disabled:opacity-60"
      >
        <Heart filled={favorited} />
        {favorited ? "Favourited" : "Favourite"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={favorited}
      aria-label={label}
      className="grid h-11 w-11 place-items-center rounded-full bg-surface/90 text-ink-soft shadow-[var(--shadow-card)] backdrop-blur-sm transition-colors hover:text-rose disabled:opacity-60"
    >
      <Heart filled={favorited} />
    </button>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={filled ? "text-rose" : ""}
    >
      <path d="M12 21l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.18L12 21z" />
    </svg>
  );
}
