import { describe, it, expect } from "vitest";
import { dollarsToCents, centsToDollars } from "./money";

describe("dollarsToCents", () => {
  it("parses integers and decimals to integer cents", () => {
    expect(dollarsToCents("10")).toBe(1000);
    expect(dollarsToCents("10.5")).toBe(1050);
    expect(dollarsToCents("10.99")).toBe(1099);
    expect(dollarsToCents("0")).toBe(0);
  });
  it("rejects invalid input", () => {
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("10.999")).toBeNull();
    expect(dollarsToCents("-5")).toBeNull();
  });
});

describe("centsToDollars", () => {
  it("formats with two decimals", () => {
    expect(centsToDollars(1099)).toBe("10.99");
    expect(centsToDollars(1000)).toBe("10.00");
  });
});
