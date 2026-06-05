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
  const sel = "rounded border p-1 text-sm";
  return (
    <form method="get" className="mb-6 flex flex-wrap items-center gap-2">
      <input name="q" defaultValue={current.q ?? ""} placeholder="Search…" className={sel} />
      <select name="category" defaultValue={current.category ?? ""} className={sel}>
        <option value="">All categories</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <select name="size" defaultValue={current.size ?? ""} className={sel}>
        <option value="">All sizes</option>
        {sizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <select name="condition" defaultValue={current.condition ?? ""} className={sel}>
        <option value="">All conditions</option>
        {conditions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <select name="brand" defaultValue={current.brand ?? ""} className={sel}>
        <option value="">All brands</option>
        {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
      </select>
      <input name="priceMin" defaultValue={current.priceMin ?? ""} placeholder="Min $" className={`${sel} w-20`} />
      <input name="priceMax" defaultValue={current.priceMax ?? ""} placeholder="Max $" className={`${sel} w-20`} />
      <select name="sort" defaultValue={current.sort ?? "newest"} className={sel}>
        <option value="newest">Newest</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
      </select>
      <button type="submit" className="rounded bg-pink-600 px-3 py-1 text-sm text-white">Filter</button>
    </form>
  );
}
