import { describe, it, expect } from "vitest";
import { isAdmin, canAccessAdminArea } from "./authz";

describe("authorization decisions", () => {
  it("isAdmin is true only for ADMIN", () => {
    expect(isAdmin("ADMIN")).toBe(true);
    expect(isAdmin("USER")).toBe(false);
  });

  it("canAccessAdminArea matches isAdmin", () => {
    expect(canAccessAdminArea("ADMIN")).toBe(true);
    expect(canAccessAdminArea("USER")).toBe(false);
  });
});
