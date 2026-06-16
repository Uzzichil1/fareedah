import { SkeletonHeader } from "@/components/skeletons/Skeletons";

function QueueItemSkeleton({ delay }: { delay: number }) {
  return (
    <li
      className="animate-pulse rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-21 w-21 rounded-xl bg-blush/50" />
        ))}
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="h-5 w-40 rounded-full bg-blush/50" />
        <div className="h-5 w-14 rounded-full bg-blush/50" />
      </div>
      <div className="mt-2 h-3 w-1/2 rounded-full bg-blush/50" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded-full bg-blush/50" />
        <div className="h-3 w-5/6 rounded-full bg-blush/50" />
      </div>
      <div className="mt-4 flex gap-2 border-t border-line pt-4">
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

      <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <div className="h-3 w-14 animate-pulse rounded-full bg-blush/50" />
            <div className="mt-2 h-8 w-48 animate-pulse rounded-full bg-blush/50" />
          </div>
          <div className="h-6 w-24 animate-pulse rounded-full bg-blush/50" />
        </div>

        <ul className="flex flex-col gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <QueueItemSkeleton key={i} delay={i * 80} />
          ))}
        </ul>
      </main>
    </>
  );
}
