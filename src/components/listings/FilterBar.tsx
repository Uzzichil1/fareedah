type Option = { id: string; label: string };

export type FilterCurrent = {
  category?: string;
  size?: string;
  condition?: string;
  brand?: string;
  priceMin?: string;
  priceMax?: string;
  q?: string;
  sort?: string;
};

const fieldBase =
  "rounded-full border border-line bg-surface text-sm text-ink shadow-[var(--shadow-card)] transition-colors placeholder:text-ink-soft/70 focus:border-rose-soft focus:outline-none focus:ring-2 focus:ring-blush";

/** A native <select> dressed as a pill, with a custom chevron. */
function Pill({
  name,
  defaultValue,
  allLabel,
  options,
}: {
  name: string;
  defaultValue: string;
  allLabel: string;
  options: Option[];
}) {
  return (
    <div className="relative">
      <select
        name={name}
        defaultValue={defaultValue}
        className={`${fieldBase} appearance-none py-2 pl-4 pr-9`}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

export function FilterBar({
  categories,
  sizes,
  conditions,
  brands,
  current,
}: {
  categories: Option[];
  sizes: Option[];
  conditions: Option[];
  brands: Option[];
  current: FilterCurrent;
}) {
  return (
    <form method="get" className="mb-10">
      {/* Search gets its own prominent line. */}
      <div className="relative mb-3 max-w-md">
        <svg
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          name="q"
          defaultValue={current.q ?? ""}
          placeholder="Search brands, pieces, sizes…"
          className={`${fieldBase} w-full py-2.5 pl-11 pr-4`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Pill name="category" defaultValue={current.category ?? ""} allLabel="All categories" options={categories} />
        <Pill name="size" defaultValue={current.size ?? ""} allLabel="All sizes" options={sizes} />
        <Pill name="condition" defaultValue={current.condition ?? ""} allLabel="Any condition" options={conditions} />
        <Pill name="brand" defaultValue={current.brand ?? ""} allLabel="All brands" options={brands} />

        <div className="flex items-center overflow-hidden rounded-full border border-line bg-surface shadow-[var(--shadow-card)]">
          <input
            name="priceMin"
            defaultValue={current.priceMin ?? ""}
            placeholder="Min"
            inputMode="numeric"
            className="w-16 bg-transparent py-2 pl-4 pr-1 text-sm text-ink placeholder:text-ink-soft/70 focus:outline-none"
          />
          <span className="text-ink-soft/60">–</span>
          <input
            name="priceMax"
            defaultValue={current.priceMax ?? ""}
            placeholder="Max"
            inputMode="numeric"
            className="w-16 bg-transparent py-2 pl-1 pr-4 text-sm text-ink placeholder:text-ink-soft/70 focus:outline-none"
          />
        </div>

        <div className="relative">
          <select
            name="sort"
            defaultValue={current.sort ?? "newest"}
            className={`${fieldBase} appearance-none py-2 pl-4 pr-9`}
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>

        <button
          type="submit"
          className="rounded-full bg-ink px-6 py-2 text-sm font-semibold tracking-wide text-paper transition-colors hover:bg-rose"
        >
          Refine
        </button>
      </div>
    </form>
  );
}
