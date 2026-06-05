export const metadata = {
  title: "Offline — TinyKloset",
};

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div
        aria-hidden
        className="grid h-20 w-20 place-items-center rounded-full bg-blush text-rose ring-1 ring-rose-soft/50"
      >
        <span className="font-display text-3xl italic">tk</span>
      </div>
      <h1 className="mt-6 font-display text-3xl text-ink">You&apos;re offline</h1>
      <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-ink-soft">
        TinyKloset can&apos;t reach the network right now. Check your connection and try
        again — pages you&apos;ve already visited will still load.
      </p>
    </main>
  );
}
