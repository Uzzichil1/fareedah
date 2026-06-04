import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("lowercases, trims, and hyphenates", () => {
    expect(slugify("  Baby Gap Onesie!  ")).toBe("baby-gap-onesie");
  });
  it("collapses non-alphanumerics and strips edge hyphens", () => {
    expect(slugify("H&M / Kids")).toBe("h-m-kids");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when it does not exist", async () => {
    expect(await uniqueSlug("shop", async () => false)).toBe("shop");
  });
  it("suffixes until free", async () => {
    const taken = new Set(["shop", "shop-2"]);
    expect(await uniqueSlug("shop", async (s) => taken.has(s))).toBe("shop-3");
  });
});
