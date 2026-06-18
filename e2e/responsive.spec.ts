import { test, expect } from "@playwright/test";
import { createUser, createStorefront, createLiveListing } from "./support/factories";
import { signIn } from "./support/auth";
import { E2E_PASSWORD } from "./support/constants";
import { expectZeroResidue } from "./support/expect-cleanup";

/**
 * C3 — Responsive regression gate.
 *
 * For each of the four target pages — `/`, `/listings/[id]` (seeded LIVE
 * listing), `/bag` (signed-in buyer), `/sell/listings/new` (signed-in
 * seller) — set a 360px viewport and assert NO horizontal overflow:
 * `document.documentElement.scrollWidth <= document.documentElement.clientWidth`
 *
 * Wait for a visible anchor element (settled layout/fonts) before measuring.
 */

test.describe("Responsive — no horizontal overflow at 360 px", () => {
  test.use({ viewport: { width: 360, height: 800 } });
  test.afterAll(() => expectZeroResidue("responsive.spec"));

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const liveTitle = `E2E-Resp-Live-${stamp}`;

  let listingId: string;
  let buyerEmail: string;
  let sellerEmail: string;

  test.beforeAll(async () => {
    test.setTimeout(60_000);

    // Seed a LIVE listing so /listings/[id] renders real content.
    const seller = await createUser({ emailTag: "resp-seller" });
    sellerEmail = seller.email;
    const store = await createStorefront(seller.id);
    const listing = await createLiveListing(store.id, { title: liveTitle, status: "LIVE" });
    listingId = listing.id;

    // A buyer for /bag (empty bag is fine — still renders the full layout).
    const buyer = await createUser({ emailTag: "resp-buyer" });
    buyerEmail = buyer.email;
  });

  /** Measures horizontal overflow in pixels (positive = overflows). */
  async function measureOverflow(page: import("@playwright/test").Page): Promise<number> {
    return page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  }

  test("`/` (anonymous browse) has no horizontal overflow at 360 px", async ({ page }) => {
    await page.goto("/");
    // Wait for a stable anchor before measuring.
    await expect(page.getByRole("link", { name: "Bag" })).toBeVisible();
    const overflow = await measureOverflow(page);
    expect(overflow, `/ overflows horizontally at 360 px by ${overflow}px`).toBeLessThanOrEqual(0);
  });

  test("`/listings/[id]` (LIVE listing) has no horizontal overflow at 360 px", async ({ page }) => {
    await page.goto(`/listings/${listingId}`);
    await expect(page.getByRole("heading", { name: liveTitle })).toBeVisible();
    const overflow = await measureOverflow(page);
    expect(overflow, `/listings/[id] overflows horizontally at 360 px by ${overflow}px`).toBeLessThanOrEqual(0);
  });

  test("`/bag` (signed-in buyer) has no horizontal overflow at 360 px", async ({ page }) => {
    await signIn(page, buyerEmail, E2E_PASSWORD);
    await page.goto("/bag");
    await expect(page.getByRole("link", { name: "Bag" })).toBeVisible();
    const overflow = await measureOverflow(page);
    expect(overflow, `/bag overflows horizontally at 360 px by ${overflow}px`).toBeLessThanOrEqual(0);
  });

  test("`/sell/listings/new` (signed-in seller) has no horizontal overflow at 360 px", async ({ page }) => {
    await signIn(page, sellerEmail, E2E_PASSWORD);
    await page.goto("/sell/listings/new");
    // Wait for the heading which indicates the page has settled.
    await expect(page.getByRole("heading", { name: "New listing" })).toBeVisible();
    const overflow = await measureOverflow(page);
    expect(overflow, `/sell/listings/new overflows horizontally at 360 px by ${overflow}px`).toBeLessThanOrEqual(0);
  });
});
