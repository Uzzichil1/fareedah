import { describe, it, expect } from "vitest";
import { onboardingState } from "./stripe-onboarding";

describe("onboardingState", () => {
  it("is not_started when there is no Stripe account", () => {
    expect(onboardingState({ hasAccount: false, chargesEnabled: false, payoutsEnabled: false })).toBe("not_started");
    // hasAccount=false dominates even if flags are somehow true
    expect(onboardingState({ hasAccount: false, chargesEnabled: true, payoutsEnabled: true })).toBe("not_started");
  });

  it("is incomplete when an account exists but charges or payouts are not enabled", () => {
    expect(onboardingState({ hasAccount: true, chargesEnabled: false, payoutsEnabled: false })).toBe("incomplete");
    expect(onboardingState({ hasAccount: true, chargesEnabled: true, payoutsEnabled: false })).toBe("incomplete");
    expect(onboardingState({ hasAccount: true, chargesEnabled: false, payoutsEnabled: true })).toBe("incomplete");
  });

  it("is enabled only when an account exists AND both charges and payouts are enabled", () => {
    expect(onboardingState({ hasAccount: true, chargesEnabled: true, payoutsEnabled: true })).toBe("enabled");
  });
});
