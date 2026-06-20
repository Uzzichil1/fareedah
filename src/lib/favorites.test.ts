import { describe, it, expect } from "vitest";
import { partitionFavorites } from "./favorites";

const row = (id: string, status: string) => ({ id, listing: { status } });

describe("partitionFavorites", () => {
  it("puts LIVE in available, everything else in unavailable", () => {
    const rows = [
      row("a", "LIVE"),
      row("b", "SOLD"),
      row("c", "ARCHIVED"),
      row("d", "LIVE"),
      row("e", "REJECTED"),
      row("f", "PENDING_REVIEW"),
    ];
    const { available, unavailable } = partitionFavorites(rows);
    expect(available.map((r) => r.id)).toEqual(["a", "d"]);
    expect(unavailable.map((r) => r.id)).toEqual(["b", "c", "e", "f"]);
  });

  it("preserves input order within each group", () => {
    const rows = [row("x", "SOLD"), row("y", "LIVE"), row("z", "SOLD")];
    const { available, unavailable } = partitionFavorites(rows);
    expect(available.map((r) => r.id)).toEqual(["y"]);
    expect(unavailable.map((r) => r.id)).toEqual(["x", "z"]);
  });

  it("handles an empty list", () => {
    expect(partitionFavorites([])).toEqual({ available: [], unavailable: [] });
  });
});
