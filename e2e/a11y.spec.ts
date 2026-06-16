import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createUser, createStorefront, createLiveListing } from "./support/factories";
import { signIn } from "./support/auth";
import { E2E_PASSWORD } from "./support/constants";
import { expectZeroResidue } from "./support/expect-cleanup";

/**
 * C2 — Accessibility regression gate.
 *
 * For each of the four "completed surface" pages the plan calls out — `/`,
 * `/listings/[id]` (a seeded LIVE listing), `/login`, and `/bag` (signed-in
 * buyer) — run axe and assert ZERO violations with `impact === "critical"`.
 *
 * Gate scope: CRITICAL only, matching the plan's wording ("no critical
 * violations"). Lower-severity findings (notably contrast, which axe rates
 * "serious") are addressed by the targeted manual sweep in C2 step 7, not by
 * this automated gate — widening the gate to "serious" would fold in the warm
 * brand palette's intentional, sweep-reviewed contrast and is out of scope.
 *
 * `/` and `/login` are anonymous (a fresh cookie-less context per test).
 * `/listings/[id]` needs a factory LIVE listing. `/bag` needs an authenticated
 * buyer — an empty bag is a perfectly valid page to axe (it still renders the
 * header, nav, and the "bag is empty" state).
 */

test.describe("Accessibility — no critical axe violations on the core surface", () => {
  test.afterAll(() => expectZeroResidue("a11y.spec"));

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const liveTitle = `E2E-A11y-Live-${stamp}`;

  let listingId: string;
  let buyerEmail: string;

  test.beforeAll(async () => {
    // Several sequential `runE2EDb` calls (each a fresh `tsx` child against the
    // pooled live DB) plus a real signin can spike under contention; give this
    // hook the same 60s headroom the other multi-seed specs use.
    test.setTimeout(60_000);

    const seller = await createUser({ emailTag: "seller" });
    const store = await createStorefront(seller.id);
    const listing = await createLiveListing(store.id, { title: liveTitle, status: "LIVE" });
    listingId = listing.id;

    // A factory buyer for the `/bag` page — `createUser` writes a real password
    // hash (E2E_PASSWORD), so `signIn` can authenticate it via the /login UI.
    const buyer = await createUser({ emailTag: "a11y-buyer" });
    buyerEmail = buyer.email;
  });

  /** Assert axe finds zero CRITICAL-impact violations on the current page. */
  async function expectNoCriticalViolations(page: import("@playwright/test").Page, label: string) {
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === "critical");
    expect(
      critical,
      `${label} has critical axe violations: ${critical.map((v) => `${v.id} (${v.nodes.length})`).join(", ")}`,
    ).toEqual([]);
  }

  test("`/` (anonymous browse) has no critical violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Bag" })).toBeVisible();
    await expectNoCriticalViolations(page, "/");
  });

  test("`/listings/[id]` (LIVE listing) has no critical violations", async ({ page }) => {
    await page.goto(`/listings/${listingId}`);
    await expect(page.getByRole("heading", { name: liveTitle })).toBeVisible();
    await expectNoCriticalViolations(page, "/listings/[id]");
  });

  test("`/login` (anonymous) has no critical violations", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expectNoCriticalViolations(page, "/login");
  });

  test("`/bag` (signed-in buyer) has no critical violations", async ({ page }) => {
    await signIn(page, buyerEmail, E2E_PASSWORD);
    await page.goto("/bag");
    await expect(page.getByRole("link", { name: "Bag" })).toBeVisible();
    await expectNoCriticalViolations(page, "/bag");
  });
});
