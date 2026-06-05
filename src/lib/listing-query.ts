import type { Prisma } from "@/generated/prisma/client";
import { dollarsToCents } from "@/lib/money";

export const PAGE_SIZE = 24;

/** Accepted public filter params. Note: there is intentionally NO `status`
 *  field — the public can never widen the query beyond LIVE. */
export type ListingFilterParams = {
  category?: string;
  size?: string;
  condition?: string;
  brand?: string;
  priceMin?: string;
  priceMax?: string;
  q?: string;
};

/** Build the Prisma where for public browse. ALWAYS pinned to LIVE. */
export function buildListingWhere(params: ListingFilterParams): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = { status: "LIVE" };

  if (params.category) where.categoryId = params.category;
  if (params.size) where.sizeId = params.size;
  if (params.condition) where.conditionId = params.condition;
  if (params.brand) where.brandId = params.brand;

  const min = params.priceMin ? dollarsToCents(params.priceMin) : null;
  const max = params.priceMax ? dollarsToCents(params.priceMax) : null;
  if (min !== null || max !== null) {
    where.priceCents = {
      ...(min !== null ? { gte: min } : {}),
      ...(max !== null ? { lte: max } : {}),
    };
  }

  if (params.q && params.q.trim()) {
    where.title = { contains: params.q.trim(), mode: "insensitive" };
  }

  return where;
}

const SORT_MAP: Record<string, Prisma.ListingOrderByWithRelationInput> = {
  newest: { createdAt: "desc" },
  price_asc: { priceCents: "asc" },
  price_desc: { priceCents: "desc" },
};

/** Whitelist the sort param; unknown values fall back to newest. */
export function parseSort(sort: string | undefined): Prisma.ListingOrderByWithRelationInput {
  return (sort ? SORT_MAP[sort] : undefined) ?? SORT_MAP.newest;
}
