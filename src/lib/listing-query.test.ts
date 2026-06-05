import { describe, it, expect } from "vitest";
import { buildListingWhere, parseSort } from "./listing-query";

describe("buildListingWhere", () => {
  it("always pins status to LIVE, even with no params", () => {
    expect(buildListingWhere({}).status).toBe("LIVE");
  });
  it("ignores a client-supplied status (no public leak)", () => {
    // status is not part of the accepted params; even if passed, it's ignored.
    const where = buildListingWhere({ status: "DRAFT" } as never);
    expect(where.status).toBe("LIVE");
  });
  it("maps category/size/condition/brand to FK equality", () => {
    const w = buildListingWhere({ category: "c", size: "s", condition: "k", brand: "b" });
    expect(w.categoryId).toBe("c");
    expect(w.sizeId).toBe("s");
    expect(w.conditionId).toBe("k");
    expect(w.brandId).toBe("b");
  });
  it("builds a price range in cents, including one-sided bounds", () => {
    expect(buildListingWhere({ priceMin: "10" }).priceCents).toEqual({ gte: 1000 });
    expect(buildListingWhere({ priceMax: "25.50" }).priceCents).toEqual({ lte: 2550 });
    expect(buildListingWhere({ priceMin: "10", priceMax: "20" }).priceCents).toEqual({ gte: 1000, lte: 2000 });
  });
  it("omits the price filter when bounds are missing or unparseable", () => {
    expect(buildListingWhere({}).priceCents).toBeUndefined();
    expect(buildListingWhere({ priceMin: "abc" }).priceCents).toBeUndefined();
  });
  it("does a case-insensitive title search", () => {
    expect(buildListingWhere({ q: "romper" }).title).toEqual({ contains: "romper", mode: "insensitive" });
    expect(buildListingWhere({ q: "   " }).title).toBeUndefined();
  });
});

describe("parseSort", () => {
  it("whitelists known sorts, defaults unknown to newest", () => {
    expect(parseSort("price_asc")).toEqual({ priceCents: "asc" });
    expect(parseSort("price_desc")).toEqual({ priceCents: "desc" });
    expect(parseSort("newest")).toEqual({ createdAt: "desc" });
    expect(parseSort(undefined)).toEqual({ createdAt: "desc" });
    expect(parseSort("; DROP TABLE")).toEqual({ createdAt: "desc" });
  });
});
