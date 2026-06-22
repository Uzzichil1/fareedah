import { describe, it, expect } from "vitest";
import { followingFeedWhere } from "./follows";

describe("followingFeedWhere", () => {
  it("is always LIVE-pinned", () => {
    expect(followingFeedWhere(["s1"]).status).toBe("LIVE");
    expect(followingFeedWhere([]).status).toBe("LIVE");
  });

  it("passes the storefront ids through unchanged", () => {
    expect(followingFeedWhere(["s1", "s2"])).toEqual({
      status: "LIVE",
      storefrontId: { in: ["s1", "s2"] },
    });
  });

  it("an empty follow set yields in:[] which matches nothing (never all listings)", () => {
    expect(followingFeedWhere([])).toEqual({ status: "LIVE", storefrontId: { in: [] } });
  });
});
