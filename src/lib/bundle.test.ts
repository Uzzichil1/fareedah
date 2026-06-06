import { describe, it, expect } from "vitest";
import { canTransition, nextStatus, listedTotalCents, offerError, ACTIVE_BUNDLE_STATUSES, PURCHASABLE } from "./bundle";

describe("canTransition / nextStatus", () => {
  it("allows item edits only from OPEN or DECLINED, landing on OPEN", () => {
    expect(canTransition("OPEN", "addItem")).toBe(true);
    expect(canTransition("DECLINED", "addItem")).toBe(true);
    expect(canTransition("SUBMITTED", "addItem")).toBe(false);
    expect(canTransition("ACCEPTED", "removeItem")).toBe(false);
    expect(nextStatus("addItem")).toBe("OPEN");
  });
  it("allows submitOffer from OPEN/DECLINED → SUBMITTED", () => {
    expect(canTransition("OPEN", "submitOffer")).toBe(true);
    expect(canTransition("DECLINED", "submitOffer")).toBe(true);
    expect(canTransition("SUBMITTED", "submitOffer")).toBe(false);
    expect(nextStatus("submitOffer")).toBe("SUBMITTED");
  });
  it("allows withdraw only from SUBMITTED → OPEN", () => {
    expect(canTransition("SUBMITTED", "withdrawOffer")).toBe(true);
    expect(canTransition("OPEN", "withdrawOffer")).toBe(false);
    expect(nextStatus("withdrawOffer")).toBe("OPEN");
  });
  it("allows seller accept/decline only from SUBMITTED", () => {
    expect(canTransition("SUBMITTED", "accept")).toBe(true);
    expect(canTransition("SUBMITTED", "decline")).toBe(true);
    expect(canTransition("ACCEPTED", "accept")).toBe(false);
    expect(nextStatus("accept")).toBe("ACCEPTED");
    expect(nextStatus("decline")).toBe("DECLINED");
  });
});

describe("listedTotalCents", () => {
  it("sums only LIVE items", () => {
    expect(
      listedTotalCents([
        { priceCents: 3400, isLive: true },
        { priceCents: 2800, isLive: true },
        { priceCents: 9900, isLive: false },
      ]),
    ).toBe(6200);
  });
  it("is 0 for no live items", () => {
    expect(listedTotalCents([{ priceCents: 5000, isLive: false }])).toBe(0);
    expect(listedTotalCents([])).toBe(0);
  });
});

describe("ACTIVE_BUNDLE_STATUSES / PURCHASABLE constants", () => {
  it("PURCHASABLE excludes DECLINED and CHECKED_OUT", () => {
    expect(PURCHASABLE).not.toContain("DECLINED");
    expect(PURCHASABLE).not.toContain("CHECKED_OUT");
    expect(PURCHASABLE).toContain("OPEN");
    expect(PURCHASABLE).toContain("SUBMITTED");
    expect(PURCHASABLE).toContain("ACCEPTED");
  });
  it("ACTIVE_BUNDLE_STATUSES includes DECLINED but excludes CHECKED_OUT", () => {
    expect(ACTIVE_BUNDLE_STATUSES).toContain("DECLINED");
    expect(ACTIVE_BUNDLE_STATUSES).not.toContain("CHECKED_OUT");
    expect(ACTIVE_BUNDLE_STATUSES).toContain("OPEN");
    expect(ACTIVE_BUNDLE_STATUSES).toContain("SUBMITTED");
    expect(ACTIVE_BUNDLE_STATUSES).toContain("ACCEPTED");
  });
});

describe("offerError", () => {
  it("rejects non-positive or non-integer offers", () => {
    expect(offerError(0, 6200)).not.toBeNull();
    expect(offerError(-5, 6200)).not.toBeNull();
    expect(offerError(12.5, 6200)).not.toBeNull();
  });
  it("rejects offers above the listed total", () => {
    expect(offerError(6300, 6200)).not.toBeNull();
  });
  it("rejects when nothing is available", () => {
    expect(offerError(100, 0)).not.toBeNull();
  });
  it("accepts a valid offer up to and including the listed total", () => {
    expect(offerError(5000, 6200)).toBeNull();
    expect(offerError(6200, 6200)).toBeNull();
  });
});
