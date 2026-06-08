import Link from "next/link";

export const metadata = {
  title: "Page not found — TinyKloset",
};

/**
 * Branded 404. Deliberately a plain, static server component — no async
 * `<SiteHeader />` (which calls `auth()` + queries Prisma) and no dynamic
 * data. Keeping this page static lets Next.js return a true `404` HTTP
 * status for unmatched routes; an async/streamed not-found page can ship
 * a `200` instead, which would break the public e2e contract that asserts
 * `resp.status() === 404` for bad URLs.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <Link
        href="/"
        className="font-display text-[1.6rem] leading-none tracking-tight text-ink"
      >
        tiny<span className="italic text-rose">kloset</span>
      </Link>

      <div className="mt-10 grid place-items-center rounded-[20px] border border-dashed border-line bg-surface/60 px-6 py-16 text-center">
        <p className="font-display text-6xl text-rose">404</p>
        <p className="mt-3 font-display text-xl italic text-rose">
          We couldn&apos;t find that page.
        </p>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">
          The link may be broken, or the piece may have found a new home. Let&apos;s get you
          back to browsing the closet.
        </p>
        <Link href="/" className="mt-4 text-sm font-semibold text-rose-deep hover:underline">
          Back to home
        </Link>
      </div>
    </main>
  );
}
