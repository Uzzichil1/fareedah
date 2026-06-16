/**
 * Shared, presentational skeleton primitives for route-level `loading.tsx`
 * fallbacks. Server-safe (no "use client", no data access) so they stay part
 * of the instant Suspense fallback. Warm token palette + `animate-pulse`.
 */

/**
 * Static stand-in for the async `<SiteHeader />`. Matches the real header's
 * height (`py-4` wrapper around an `h-10` row = ~72px / 4.5rem) so swapping in
 * the real header causes no vertical layout shift. Does NOT call the DB.
 */
export function SkeletonHeader() {
  return (
    <div className="border-b border-line/70">
      <div className="mx-auto flex max-w-6xl items-center px-5 py-4 sm:px-8">
        <div className="flex h-10 items-center">
          <div className="h-5 w-28 animate-pulse rounded-full bg-blush/50" />
        </div>
      </div>
    </div>
  );
}

/**
 * Card-shaped skeleton mirroring `ListingCard` (an `aspect-[4/5]` framed image
 * plus brand eyebrow / title / price+size lines). Shared by `/` and
 * `/store/[slug]`, whose card grids are byte-for-byte identical.
 */
export function SkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <div className="animate-pulse" style={{ animationDelay: `${delay}ms` }}>
      <div className="aspect-[4/5] w-full rounded-[14px] bg-blush/50 ring-1 ring-line" />
      <div className="mt-3 px-0.5">
        <div className="h-2.5 w-1/3 rounded-full bg-blush/50" />
        <div className="mt-2 h-3 w-4/5 rounded-full bg-blush/50" />
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <div className="h-4 w-12 rounded-full bg-blush/50" />
          <div className="h-3 w-8 rounded-full bg-blush/50" />
        </div>
      </div>
    </div>
  );
}
