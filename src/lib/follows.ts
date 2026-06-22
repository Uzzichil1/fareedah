/**
 * Prisma `where` for the "shops you follow" feed. ALWAYS LIVE-pinned. An empty
 * follow set yields `storefrontId: { in: [] }`, which matches NOTHING — the feed
 * must never fall back to showing all listings. Pure (no DB / no server-only).
 * `status` is the literal "LIVE" (not `string`) so a typo fails at tsc.
 */
export function followingFeedWhere(
  storefrontIds: string[],
): { status: "LIVE"; storefrontId: { in: string[] } } {
  return { status: "LIVE", storefrontId: { in: storefrontIds } };
}
