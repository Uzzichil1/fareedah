// src/components/store/FollowButton.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleFollow } from "@/app/following/actions";

type Props = {
  storefrontId: string;
  initialFollowing: boolean;
  isAuthenticated: boolean;
};

export function FollowButton({ storefrontId, initialFollowing, isAuthenticated }: Props) {
  const router = useRouter();
  // Local optimistic state; NOT derived from the prop on re-render (component is
  // keyed by storefrontId). Reconciliation via router.refresh() after success.
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    const next = !following;
    setFollowing(next); // optimistic
    startTransition(async () => {
      const r = await toggleFollow(storefrontId);
      if ("error" in r) {
        setFollowing(!next); // revert
      } else {
        setFollowing(r.following);
        router.refresh(); // reconcile follower count + /following feed
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={following}
      aria-label={following ? "Unfollow this shop" : "Follow this shop"}
      className={
        following
          ? "inline-flex min-h-[44px] items-center rounded-full border border-line bg-surface px-5 py-2 text-sm font-semibold text-ink transition-colors hover:border-rose-soft disabled:opacity-60"
          : "inline-flex min-h-[44px] items-center rounded-full bg-rose px-5 py-2 text-sm font-semibold text-paper transition-colors hover:bg-rose-deep disabled:opacity-60"
      }
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
