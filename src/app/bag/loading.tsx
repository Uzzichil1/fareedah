function RowSkeleton({ delay }: { delay: number }) {
  return (
    <li
      className="animate-pulse rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="h-5 w-32 rounded-full bg-blush/50" />
        <div className="h-5 w-20 rounded-full bg-blush/50" />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-lg bg-blush/50" />
            <div className="h-3 flex-1 rounded-full bg-blush/50" />
            <div className="h-3 w-10 rounded-full bg-blush/50" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
        <div className="h-4 w-20 rounded-full bg-blush/50" />
        <div className="h-5 w-14 rounded-full bg-blush/50" />
      </div>
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
        <div className="mb-8 h-8 w-40 animate-pulse rounded-full bg-blush/50" />

        <ul className="flex flex-col gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <RowSkeleton key={i} delay={i * 80} />
          ))}
        </ul>
      </main>
    </>
  );
}
