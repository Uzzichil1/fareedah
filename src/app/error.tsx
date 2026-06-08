"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

/**
 * Root error boundary — must be a Client Component (App Router requirement).
 * It cannot render the async `<SiteHeader />` (a Server Component that calls
 * `auth()` + Prisma), so the brand wordmark is rendered inline here, mirroring
 * the self-contained branded layout used by `src/app/offline/page.tsx`.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to the console (and, in time, an error reporting service) for
    // diagnosis — the digest can be matched against server-side logs.
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <Link
        href="/"
        className="font-display text-[1.6rem] leading-none tracking-tight text-ink"
      >
        tiny<span className="italic text-rose">kloset</span>
      </Link>

      <div className="mt-10 grid place-items-center rounded-[20px] border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
        <p className="font-display text-xl italic text-rose">Something went wrong.</p>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">
          We hit a snag loading this page. Try again, or head back home while we sort it
          out.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Link href="/" className="text-sm font-semibold text-rose-deep hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
