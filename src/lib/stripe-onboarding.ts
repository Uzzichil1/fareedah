// Pure onboarding-state logic — no Stripe, no I/O. Unit-tested.

export type OnboardingState = "not_started" | "incomplete" | "enabled";

export function onboardingState(input: {
  hasAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}): OnboardingState {
  if (!input.hasAccount) return "not_started";
  if (input.chargesEnabled && input.payoutsEnabled) return "enabled";
  return "incomplete";
}
