import { SkeletonHeader } from "@/components/skeletons/Skeletons";

function OfferSkeleton({ delay }: { delay: number }) {
  return (
    <li
      className="animate-pulse rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="h-3 w-36 rounded-full bg-blush/50" />
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
      <div className="mt-1 flex items-baseline justify-between">
        <div className="h-4 w-16 rounded-full bg-blush/50" />
        <div className="h-5 w-14 rounded-full bg-blush/50" />
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-9 w-24 rounded-full bg-surface ring-1 ring-line" />
        <div className="h-9 w-24 rounded-full bg-surface ring-1 ring-line" />
      </div>
    </li>
  );
}

export default function Loading() {
  return (
    <>
      <SkeletonHeader />

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <div className="h-3 w-14 animate-pulse rounded-full bg-blush/50" />
            <div className="mt-2 h-8 w-28 animate-pulse rounded-full bg-blush/50" />
          </div>
          <div className="h-6 w-24 animate-pulse rounded-full bg-blush/50" />
        </div>

        <ul className="flex flex-col gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <OfferSkeleton key={i} delay={i * 80} />
          ))}
        </ul>
      </main>
    </>
  );
}
