import { SkeletonHeader, SkeletonCard } from "@/components/skeletons/Skeletons";

export default function Loading() {
  return (
    <>
      <SkeletonHeader />
      <main className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        <div className="mb-5 h-10 border-b border-line" />
        <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </main>
    </>
  );
}
