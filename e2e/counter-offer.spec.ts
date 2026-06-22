// e2e/counter-offer.spec.ts
import { test, expect } from "@playwright/test";
import { createUser, createStorefront, createLiveListing } from "./support/factories";
import { signInAs } from "./support/auth";
import { expectZeroResidue } from "./support/expect-cleanup";

test.describe("Counter-offers", () => {
  // Negotiation has many steps + identity switches + tsx-subprocess seeding.
  test.setTimeout(90_000);

  test.afterAll(async () => {
    await expectZeroResidue("counter-offer");
  });

  test("buyer offers, seller counters, buyer counters back, seller accepts", async ({ page, context }) => {
    const seller = await createUser({ emailTag: "co-seller" });
    const store = await createStorefront(seller.id);
    const l1 = await createLiveListing(store.id, { title: `Counter Onesie ${Date.now()}`, priceCents: 4000 });
    const l2 = await createLiveListing(store.id, { title: `Counter Hat ${Date.now()}`, priceCents: 3000 });
    const buyer = await createUser({ emailTag: "co-buyer" });

    // Buyer adds two items + sends an offer.
    await signInAs(page, buyer);
    await page.goto(`/listings/${l1.id}`);
    await page.getByRole("button", { name: /add to bag/i }).click();
    await page.waitForURL("**/bag");
    await page.goto(`/listings/${l2.id}`);
    await page.getByRole("button", { name: /add to bag/i }).click();
    await page.waitForURL("**/bag");
    await page.getByLabel("Offer amount in USD").fill("50");
    await page.getByRole("button", { name: /send offer/i }).click();
    await expect(page.getByText(/offer sent/i)).toBeVisible();

    // Seller counters.
    await context.clearCookies();
    await signInAs(page, seller);
    await page.goto("/sell/offers");
    await expect(page.getByText(/offered/i)).toBeVisible();
    await page.getByLabel("Counter amount in USD").fill("65");
    await page.getByRole("button", { name: /^counter$/i }).click();
    await expect(page.getByText(/awaiting buyer/i)).toBeVisible();

    // Buyer sees the counter and counters back.
    await context.clearCookies();
    await signInAs(page, buyer);
    await page.goto("/bag");
    await expect(page.getByText(/seller countered/i)).toBeVisible();
    await expect(page.getByText(/seller's counter/i)).toBeVisible();
    await page.getByLabel("Counter amount in USD").fill("58");
    await page.getByRole("button", { name: /^counter$/i }).click();
    await expect(page.getByText(/offer sent/i)).toBeVisible();

    // Seller accepts the re-countered offer.
    await context.clearCookies();
    await signInAs(page, seller);
    await page.goto("/sell/offers");
    await page.getByRole("button", { name: /accept offer/i }).click();

    // Buyer sees it accepted.
    await context.clearCookies();
    await signInAs(page, buyer);
    await page.goto("/bag");
    await expect(page.getByText(/offer accepted/i)).toBeVisible();
  });

  test("buyer declines a seller counter", async ({ page, context }) => {
    const seller = await createUser({ emailTag: "co2-seller" });
    const store = await createStorefront(seller.id);
    const l1 = await createLiveListing(store.id, { title: `Decline Counter Item ${Date.now()}`, priceCents: 5000 });
    const buyer = await createUser({ emailTag: "co2-buyer" });

    await signInAs(page, buyer);
    await page.goto(`/listings/${l1.id}`);
    await page.getByRole("button", { name: /add to bag/i }).click();
    await page.waitForURL("**/bag");
    await page.getByLabel("Offer amount in USD").fill("40");
    await page.getByRole("button", { name: /send offer/i }).click();
    await expect(page.getByText(/offer sent/i)).toBeVisible();

    await context.clearCookies();
    await signInAs(page, seller);
    await page.goto("/sell/offers");
    await page.getByLabel("Counter amount in USD").fill("48");
    await page.getByRole("button", { name: /^counter$/i }).click();
    await expect(page.getByText(/awaiting buyer/i)).toBeVisible();

    await context.clearCookies();
    await signInAs(page, buyer);
    await page.goto("/bag");
    await page.getByRole("button", { name: /decline counter/i }).click();
    await expect(page.getByText(/offer declined/i)).toBeVisible();
  });
});
