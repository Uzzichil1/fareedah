import { test, expect } from "@playwright/test";

/**
 * Harness smoke test — proves the Playwright setup actually works:
 *  - the `webServer` built and started the app (prod server on :3000)
 *  - a real Chromium browser launched
 *  - `baseURL` resolved and the homepage rendered
 *
 * Intentionally minimal: no auth, no DB, no fixtures — just "does the app
 * come up and look like TinyKloset". Those concerns are covered by later
 * tasks (B2+).
 */
test("homepage renders the TinyKloset brand wordmark", async ({ page }) => {
  await page.goto("/");

  // The "tinykloset" wordmark appears (split across styled spans) in the
  // site header — getByText matches on the element's combined text content.
  await expect(page.getByText(/kloset/i).first()).toBeVisible();

  // Sanity check the page actually has a real, non-empty title.
  await expect(page).toHaveTitle(/.+/);
});
