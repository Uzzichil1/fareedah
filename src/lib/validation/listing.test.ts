import { describe, it, expect } from "vitest";
import { listingDraftSchema, listingSubmitSchema } from "./listing";

describe("listingDraftSchema", () => {
  it("requires title, category, condition (the non-null FKs)", () => {
    expect(listingDraftSchema.safeParse({ title: "Tee", categoryId: "c", conditionId: "k" }).success).toBe(true);
    expect(listingDraftSchema.safeParse({ title: "", categoryId: "c", conditionId: "k" }).success).toBe(false);
    expect(listingDraftSchema.safeParse({ title: "Tee", categoryId: "", conditionId: "k" }).success).toBe(false);
  });
});

describe("listingSubmitSchema", () => {
  const ok = {
    title: "Cozy tee", description: "Soft cotton tee, barely worn.",
    priceCents: 1200, categoryId: "c", conditionId: "k",
    images: [{ url: "https://x/y.jpg", position: 0 }],
  };
  it("accepts a complete listing", () => {
    expect(listingSubmitSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects zero price and empty images", () => {
    expect(listingSubmitSchema.safeParse({ ...ok, priceCents: 0 }).success).toBe(false);
    expect(listingSubmitSchema.safeParse({ ...ok, images: [] }).success).toBe(false);
  });
});
