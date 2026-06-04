import { describe, it, expect } from "vitest";
import { rejectionSchema } from "./curation";

describe("rejectionSchema", () => {
  it("accepts a reason of >= 5 chars", () => {
    expect(rejectionSchema.safeParse({ reason: "Blurry photos" }).success).toBe(true);
  });
  it("rejects too-short or empty reasons", () => {
    expect(rejectionSchema.safeParse({ reason: "no" }).success).toBe(false);
    expect(rejectionSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(rejectionSchema.safeParse({ reason: "   " }).success).toBe(false);
  });
});
