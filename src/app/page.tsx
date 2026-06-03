import Link from "next/link";

const AGE_BRACKETS = [
  "Preemie",
  "0–3M",
  "3–6M",
  "6–12M",
  "12–18M",
  "18–24M",
  "2T",
  "3T",
  "4T",
  "5T",
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-4">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-pink-600 text-xs text-white">
            TK
          </span>
          TinyKloset
        </span>
        <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-medium text-pink-700">
          Phase 1 preview
        </span>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col">
        <section className="px-5 pt-8 pb-10 sm:pt-14">
          <div className="mx-auto w-full max-w-md sm:max-w-lg">
            <p className="text-sm font-medium text-pink-600">
              Curated. Pre-loved. Boutique.
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Little outfits,
              <br />
              loved again.
            </h1>
            <p className="mt-4 text-base leading-7 text-zinc-600">
              TinyKloset is a peer-to-peer marketplace for pre-loved and boutique
              baby &amp; children&apos;s clothing, footwear, and accessories — shop by
              age, size, brand, and condition, and check out across multiple
              sellers in one go.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/"
                aria-disabled
                className="flex h-12 items-center justify-center rounded-full bg-pink-600 px-6 text-sm font-medium text-white transition-colors hover:bg-pink-700"
              >
                Shop the kloset
              </Link>
              <Link
                href="/"
                aria-disabled
                className="flex h-12 items-center justify-center rounded-full border border-zinc-200 px-6 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
              >
                Start selling
              </Link>
            </div>
            <p className="mt-3 text-xs text-zinc-400">
              Browsing &amp; selling open up in later phases — this is the scaffold.
            </p>
          </div>
        </section>

        {/* Shop by age */}
        <section className="border-t border-zinc-100 px-5 py-8">
          <div className="mx-auto w-full max-w-md sm:max-w-lg">
            <h2 className="text-sm font-semibold text-zinc-900">Shop by age</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {AGE_BRACKETS.map((age) => (
                <li
                  key={age}
                  className="rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-sm text-zinc-700"
                >
                  {age}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Trust strip */}
        <section className="border-t border-zinc-100 px-5 py-8">
          <div className="mx-auto grid w-full max-w-md gap-4 sm:max-w-lg sm:grid-cols-3">
            {[
              {
                title: "Admin-curated",
                body: "Every listing is reviewed before it goes live.",
              },
              {
                title: "Bundle & save",
                body: "Combine items from one seller, pay shipping once.",
              },
              {
                title: "Secure escrow",
                body: "Funds released to sellers only after delivery.",
              },
            ].map(({ title, body }) => (
              <div key={title} className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-sm font-semibold text-zinc-900">{title}</p>
                <p className="mt-1 text-sm leading-6 text-zinc-600">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="px-5 py-8 text-center text-xs text-zinc-400">
        © {new Date().getFullYear()} TinyKloset
      </footer>
    </div>
  );
}
