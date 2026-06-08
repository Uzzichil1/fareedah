import { test, expect } from "@playwright/test";
import { createUser, createStorefront, createLiveListing, E2E_PASSWORD } from "./support/factories";
import { signIn } from "./support/auth";
import { cleanupE2EData, countE2EData } from "./support/cleanup";

/**
 * B4 — Admin curation spec.
 *
 * Seeds two PENDING_REVIEW listings via factories (no signup UI — that's B3's
 * job), signs in as an ADMIN, and drives `/admin`:
 *   - Approve one  → it leaves the queue, becomes LIVE, and shows on `/`.
 *   - Reject the other WITH a reason → it leaves the queue, and the seller's
 *     edit page renders the "Rejected: <reason>" banner.
 *
 * Identity switch: admin → seller is done by clearing cookies then `signIn`
 * again (the cleanest logout in E2E — there's no UI logout button driven here).
 *
 * Listings are kept IMAGELESS (per the plan): `ListingCard` renders a
 * placeholder for imageless listings, so they show on `/` fine without
 * touching `next/image` remote-host config.
 */

test.afterAll(async () => {
  const deleted = await cleanupE2EData();
  console.log("[admin.spec] cleanupE2EData deleted:", deleted);
  expect(await countE2EData()).toEqual({
    bundleItems: 0,
    bundles: 0,
    listings: 0,
    storefronts: 0,
    users: 0,
  });
});

test("admin approves one PENDING_REVIEW listing (→ LIVE on /) and rejects another with a reason (→ seller sees it on edit)", async ({ page }) => {
  const stamp = Date.now();
  const approveTitle = `E2E-Approve-${stamp}`;
  const rejectTitle = `E2E-Reject-${stamp}`;
  const reason = "Photos are too blurry to publish.";

  // --- Seed: ADMIN + a seller with a storefront and two PENDING_REVIEW listings. ---
  const admin = await createUser({ role: "ADMIN", emailTag: "admin" });
  const seller = await createUser({ emailTag: "seller" });
  const store = await createStorefront(seller.id);
  await createLiveListing(store.id, { status: "PENDING_REVIEW", title: approveTitle });
  const rejectListing = await createLiveListing(store.id, { status: "PENDING_REVIEW", title: rejectTitle });

  // --- Step 1: Sign in as ADMIN. ---
  await signIn(page, admin.email, E2E_PASSWORD);

  // --- Step 2: Open the curation queue and confirm both seeded listings show. ---
  await page.goto("/admin");
  await expect(page.getByText(approveTitle)).toBeVisible();
  await expect(page.getByText(rejectTitle)).toBeVisible();

  // --- Step 3: Approve the approve-listing, scoped to its card. ---
  const approveCard = page.locator("main ul > li", { hasText: approveTitle });
  await approveCard.getByRole("button", { name: /approve & publish/i }).click();
  // `router.refresh()` re-fetches the PENDING_REVIEW queue — the now-LIVE
  // listing leaves it. `toHaveCount(0)` retries until the refresh settles.
  await expect(page.locator("main ul > li", { hasText: approveTitle })).toHaveCount(0);

  // --- Step 4: Confirm it now appears on `/` as LIVE (title search avoids
  //         pagination/order flakiness). ---
  await page.goto(`/?q=${encodeURIComponent(approveTitle)}`);
  await expect(page.getByText(approveTitle)).toBeVisible();

  // --- Step 5: Reject the reject-listing WITH a reason, scoped to its card. ---
  await page.goto("/admin");
  const rejectCard = page.locator("main ul > li", { hasText: rejectTitle });
  await rejectCard.getByPlaceholder("Reason for rejection (required to reject)").fill(reason);
  await rejectCard.getByRole("button", { name: /^reject$/i }).click();
  await expect(page.locator("main ul > li", { hasText: rejectTitle })).toHaveCount(0);

  // --- Step 6: Switch identity admin → seller (clear cookies, sign in again). ---
  await page.context().clearCookies();
  await signIn(page, seller.email, E2E_PASSWORD);

  // --- Step 7: The seller's edit page for the rejected listing shows the reason. ---
  await page.goto(`/sell/listings/${rejectListing.id}/edit`);
  await expect(page.getByText("Rejected:")).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();
});
