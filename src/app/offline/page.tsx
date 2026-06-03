export const metadata = {
  title: "Offline — TinyKloset",
};

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mx-auto h-16 w-16 rounded-full bg-pink-600" aria-hidden />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="mt-2 max-w-sm text-zinc-600">
        TinyKloset can&apos;t reach the network right now. Check your connection and try
        again — pages you&apos;ve already visited will still load.
      </p>
    </main>
  );
}
