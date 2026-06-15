function RowSkeleton({ delay }: { delay: number }) {
  return (
    <li
      className="flex animate-pulse items-center gap-4 border-b border-line px-4 py-3 last:border-b-0"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="h-13 w-13 rounded-lg bg-blush/50" />
      <div className="min-w-0 flex-1">
        <div className="h-3.5 w-2/3 rounded-full bg-blush/50" />
        <div className="mt-2 h-3 w-12 rounded-full bg-blush/50" />
      </div>
      <div className="h-5 w-16 rounded-full bg-blush/50" />
    </li>
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

      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <div className="h-3 w-20 animate-pulse rounded-full bg-blush/50" />
            <div className="mt-2 h-8 w-32 animate-pulse rounded-full bg-blush/50" />
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-9 w-24 animate-pulse rounded-full bg-surface ring-1 ring-line"
                style={{ animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
        </div>

        <ul className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
          {Array.from({ length: 4 }).map((_, i) => (
            <RowSkeleton key={i} delay={i * 70} />
          ))}
        </ul>
      </main>
    </>
  );
}
