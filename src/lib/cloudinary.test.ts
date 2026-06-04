import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { buildUploadSignature } from "./cloudinary";

describe("buildUploadSignature", () => {
  it("matches sorted-params SHA-1 with the secret appended", () => {
    const params = { timestamp: 1234567890, folder: "tinykloset/listings" };
    const secret = "test_secret";
    const expected = createHash("sha1")
      .update("folder=tinykloset/listings&timestamp=1234567890" + secret)
      .digest("hex");
    expect(buildUploadSignature(params, secret)).toBe(expected);
  });

  it("is deterministic and order-independent in input", () => {
    const secret = "s";
    const a = buildUploadSignature({ a: 1, b: 2 }, secret);
    const b = buildUploadSignature({ b: 2, a: 1 }, secret);
    expect(a).toBe(b);
  });
});
