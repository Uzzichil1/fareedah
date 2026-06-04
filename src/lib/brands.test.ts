import { describe, it, expect, vi } from "vitest";
import { findOrCreateBrand } from "./brands";

describe("findOrCreateBrand", () => {
  it("returns null for blank names", async () => {
    const db = { brand: { upsert: vi.fn() } };
    expect(await findOrCreateBrand(db as never, "   ")).toBeNull();
    expect(db.brand.upsert).not.toHaveBeenCalled();
  });
  it("upserts by slug with the trimmed name", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "b1", name: "Baby Gap", slug: "baby-gap" });
    const db = { brand: { upsert } };
    const brand = await findOrCreateBrand(db as never, "  Baby Gap  ");
    expect(brand?.slug).toBe("baby-gap");
    expect(upsert).toHaveBeenCalledWith({
      where: { slug: "baby-gap" },
      update: {},
      create: { name: "Baby Gap", slug: "baby-gap" },
    });
  });
});
