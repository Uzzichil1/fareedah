import { SkeletonHeader, SkeletonCard } from "@/components/skeletons/Skeletons";

export default function Loading() {
  return (
    <>
      <SkeletonHeader />

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
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
            <SkeletonCard key={i} delay={Math.min(i, 10) * 55} />
          ))}
        </div>
      </main>
    </>
  );
}
