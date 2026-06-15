function CardSkeleton({ delay }: { delay: number }) {
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

export default function Loading() {
  return (
    <>
      {/* Static header placeholder — avoids invoking the async SiteHeader */}
      <div className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-5 sm:px-8">
          <div className="h-5 w-28 animate-pulse rounded-full bg-blush/50" />
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        {/* Hero placeholder */}
        <section className="py-12 sm:py-16">
          <div className="mb-4 h-3 w-48 animate-pulse rounded-full bg-blush/50" />
          <div className="h-10 w-72 animate-pulse rounded-full bg-blush/50 sm:h-12 sm:w-96" />
          <div className="mt-5 h-4 w-full max-w-md animate-pulse rounded-full bg-blush/50" />
        </section>

        {/* Filter bar placeholder */}
        <div className="mb-8 flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-24 animate-pulse rounded-full bg-surface ring-1 ring-line"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>

        {/* Results meta placeholder */}
        <div className="mb-5 flex items-baseline justify-between border-b border-line pb-3">
          <div className="h-5 w-28 animate-pulse rounded-full bg-blush/50" />
          <div className="h-4 w-16 animate-pulse rounded-full bg-blush/50" />
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} delay={Math.min(i, 10) * 55} />
          ))}
        </div>
      </main>
    </>
  );
}
