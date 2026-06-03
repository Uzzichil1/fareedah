import { describe, it, expect } from "vitest";
import { signupSchema, loginSchema } from "./auth";

describe("signupSchema", () => {
  it("accepts a valid signup", () => {
    const r = signupSchema.safeParse({
      name: "Ada",
      email: "ada@example.com",
      password: "Str0ng!pass",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a weak password", () => {
    const r = signupSchema.safeParse({
      name: "Ada",
      email: "ada@example.com",
      password: "weak",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const r = signupSchema.safeParse({
      name: "Ada",
      email: "not-an-email",
      password: "Str0ng!pass",
    });
    expect(r.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts email + password", () => {
    const r = loginSchema.safeParse({
      email: "ada@example.com",
      password: "anything",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing password", () => {
    const r = loginSchema.safeParse({ email: "ada@example.com" });
    expect(r.success).toBe(false);
  });
});
