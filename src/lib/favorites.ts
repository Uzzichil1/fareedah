/**
 * Splits favourite rows into currently-buyable (listing status LIVE) and
 * everything else (sold/archived/etc.), preserving input order within each
 * group. Pure — no DB, no server-only, so it is safe to unit-test.
 */
export function partitionFavorites<T extends { listing: { status: string } }>(
  rows: T[],
): { available: T[]; unavailable: T[] } {
  const available: T[] = [];
  const unavailable: T[] = [];
  for (const row of rows) {
    (row.listing.status === "LIVE" ? available : unavailable).push(row);
  }
  return { available, unavailable };
}
