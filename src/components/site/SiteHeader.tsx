import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PURCHASABLE } from "@/lib/bundle";

/**
 * Global top bar: the brand wordmark plus primary navigation. Translucent over
 * the warm paper, with a hairline rule and backdrop blur so content scrolls
 * softly beneath it. Real routes only — no dead links.
 */
export async function SiteHeader() {
  const session = await auth();
  let bagCount = 0;
  if (session?.user?.id) {
    bagCount = await prisma.bundleItem.count({
      where: {
        bundle: {
          buyerId: session.user.id,
          status: { in: [...PURCHASABLE] },
        },
        listing: { status: "LIVE" },
      },
    });
  }
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-5 py-4 sm:gap-4 sm:px-8">
        <Link
          href="/"
          className="font-display text-[1.6rem] leading-none tracking-tight text-ink"
        >
          tiny<span className="italic text-rose">kloset</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-ink-soft sm:flex">
          <Link href="/" className="transition-colors hover:text-ink">
            Shop
          </Link>
          <Link href="/favourites" className="transition-colors hover:text-ink">
            Favourites
          </Link>
          <Link href="/sell" className="transition-colors hover:text-ink">
            Sell
          </Link>
          <Link href="/account" className="transition-colors hover:text-ink">
            Account
          </Link>
        </nav>

        <div className="flex items-center gap-1">
          <Link
            href="/sell"
            className="inline-flex min-h-[44px] items-center rounded-full border border-line bg-surface px-3 py-2 text-xs font-semibold tracking-wide text-ink shadow-[var(--shadow-card)] transition-colors hover:border-rose-soft hover:text-rose sm:hidden sm:px-4"
          >
            Sell
          </Link>
          <Link
            href="/favourites"
            aria-label="Favourites"
            className="grid h-11 w-11 place-items-center rounded-full text-ink-soft transition-colors hover:bg-blush hover:text-ink"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 21l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.18L12 21z" />
            </svg>
          </Link>
          <Link
            href="/bag"
            aria-label={
              bagCount > 0
                ? `Bag, ${bagCount} ${bagCount === 1 ? "item" : "items"}`
                : "Bag"
            }
            className="relative grid h-11 w-11 place-items-center rounded-full text-ink-soft transition-colors hover:bg-blush hover:text-ink"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 7h12l-1 13H7L6 7z" />
              <path d="M9 7a3 3 0 0 1 6 0" />
            </svg>
            {bagCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose px-1 text-[10px] font-semibold text-paper"
              >
                {bagCount}
              </span>
            )}
          </Link>
          <Link
            href="/account"
            aria-label="Account"
            className="grid h-11 w-11 place-items-center rounded-full text-ink-soft transition-colors hover:bg-blush hover:text-ink"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
