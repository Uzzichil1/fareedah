import { describe, it, expect } from "vitest";
import { storefrontSchema } from "./storefront";

describe("storefrontSchema", () => {
  it("requires a name of >= 2 chars", () => {
    expect(storefrontSchema.safeParse({ name: "Ada's Closet" }).success).toBe(true);
    expect(storefrontSchema.safeParse({ name: "A" }).success).toBe(false);
  });
});
