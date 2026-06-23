import { test, expect } from "@playwright/test";
import { createUser, createStorefront } from "./support/factories";
import { signIn } from "./support/auth";
import { E2E_PASSWORD } from "./support/constants";
import { expectZeroResidue } from "./support/expect-cleanup";

test.describe("4b — Stripe payout onboarding (no Stripe round-trip)", () => {
  test.afterAll(() => expectZeroResidue("payouts.spec"));

  test("a seller with no Stripe account sees the Set up payouts CTA + dashboard banner", async ({ page }) => {
    test.setTimeout(60_000);
    const seller = await createUser({ emailTag: "payouts-seller" });
    await createStorefront(seller.id); // no stripeAccountId → not_started

    await signIn(page, seller.email, E2E_PASSWORD);

    // Dashboard soft banner
    await page.goto("/sell");
    await expect(page.getByRole("link", { name: /set up payouts/i })).toBeVisible();

    // Payouts page CTA (reads stored flags; no Stripe call on load)
    await page.goto("/sell/payouts");
    await expect(page.getByRole("heading", { name: "Payouts" })).toBeVisible();
    await expect(page.getByRole("button", { name: /set up payouts/i })).toBeVisible();
  });

  test("the webhook rejects an unsigned request with 400", async ({ request }) => {
    const res = await request.post("/api/stripe/webhook", {
      data: { hello: "world" }, // no valid stripe-signature header
    });
    expect(res.status()).toBe(400);
  });

  test("a seller with no Stripe account visiting /return is redirected to /sell/payouts", async ({ page }) => {
    test.setTimeout(60_000);
    const seller = await createUser({ emailTag: "payouts-return-seller" });
    await createStorefront(seller.id); // no stripeAccountId → refreshOnboardingStatus no-ops

    await signIn(page, seller.email, E2E_PASSWORD);

    // No stripeAccountId → refreshOnboardingStatus returns early (no Stripe call).
    await page.goto("/sell/payouts/return");
    await expect(page).toHaveURL(/\/sell\/payouts$/);
    await expect(page.getByRole("heading", { name: "Payouts" })).toBeVisible();
  });
});
