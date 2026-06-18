import { SkeletonHeader, SkeletonCard } from "@/components/skeletons/Skeletons";

export default function Loading() {
  return (
    <>
      <SkeletonHeader />

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        {/* Banner placeholder */}
        <div className="relative mt-4 h-40 animate-pulse overflow-hidden rounded-[20px] bg-blush/60 ring-1 ring-line sm:h-52" />

        {/* Identity placeholder */}
        <div className="-mt-10 flex flex-col items-center px-4 text-center sm:-mt-12">
          <div className="h-24 w-24 animate-pulse rounded-full bg-blush/50 ring-4 ring-paper shadow-[var(--shadow-lift)]" />
          <div className="mt-4 h-7 w-48 animate-pulse rounded-full bg-blush/50" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded-full bg-blush/50" />
        </div>

        {/* Listings meta placeholder */}
        <div className="mb-5 mt-10 flex items-baseline justify-between border-b border-line pb-3">
          <div className="h-5 w-24 animate-pulse rounded-full bg-blush/50" />
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
