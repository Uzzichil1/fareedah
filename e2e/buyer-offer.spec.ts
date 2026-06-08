import { test, expect } from "@playwright/test";
import { createUser, createStorefront, createLiveListing } from "./support/factories";
import { signIn } from "./support/auth";
import { E2E_PASSWORD } from "./support/constants";
import { expectZeroResidue } from "./support/expect-cleanup";

/**
 * B5 — Buyer + offer negotiation spec (the most complex journey: a buyer↔seller
 * offer round-trip with three identity switches).
 *
 * Seed (factories — imageless LIVE listings; `ListingCard`/the detail page both
 * render a placeholder for imageless listings, so no `next/image` remote-host
 * config is needed): a seller with a storefront and TWO LIVE listings:
 *   - item A: $34.00 (3400c)   - item B: $28.00 (2800c)   → listed total $62.00.
 *
 * Flow:
 *   Buyer (real signup) → browse → open A → Add to bag (redirects to `/bag`,
 *   header count 1) → add B (one bundle, 2 items, header count 2) → over-total
 *   offer "$100" → assert the SPECIFIC rejection (bundle stays OPEN) → valid
 *   offer "$50" → "Offer sent" (SUBMITTED).
 *   Seller (identity switch) → owner viewing own listing has NO "Add to bag"
 *   (the ownership guard) → `/sell/offers` → Accept (offer leaves the list).
 *   Buyer again (identity switch back) → `/bag` shows "Offer accepted".
 *
 * --- Selector note (`main > ul > li`, NOT `main ul > li`): on `/bag` and
 * `/sell/offers` each bundle `<li>` nests a per-item `<ul>`. The descendant
 * form `main ul > li` matches BOTH the outer bundle list AND those inner item
 * lists, so it OVER-counts (1 bundle + 2 items = 3). The direct-child form
 * `main > ul > li` targets only the outer bundle/offer rows. (B3/B4's pages
 * have no nested item `<ul>`, which is why the plan's `main ul > li` was fine
 * there.) This makes count=1 actually mean "exactly one bundle" — a
 * strengthening, not a downgrade. ---
 */

test.afterAll(() => expectZeroResidue("buyer-offer.spec"));

test("buyer bags two items into one bundle, gets an over-total offer rejected then a valid one accepted by the seller, and cannot add their own listing", async ({ page }) => {
  // Three identity switches + ~10 navigations push this past Playwright's
  // default 30s per-test budget; give it room.
  test.setTimeout(60_000);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // --- Seed: seller + storefront + two LIVE listings (listed total $62.00). ---
  const seller = await createUser({ emailTag: "seller" });
  const store = await createStorefront(seller.id);
  const itemATitle = `E2E-ItemA-${stamp}`;
  const itemBTitle = `E2E-ItemB-${stamp}`;
  const listingA = await createLiveListing(store.id, { title: itemATitle, priceCents: 3400 });
  const listingB = await createLiveListing(store.id, { title: itemBTitle, priceCents: 2800 });

  const buyerEmail = `e2e+buyer-${stamp}@test.tk`;

  // === Buyer phase (real signup, like B3) ===

  // --- Step 1: Sign up the buyer via the real `/signup` UI. signupAction
  //         auto-signs-in and redirects to `/account`. ---
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Buyer");
  await page.getByLabel("Email").fill(buyerEmail);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.waitForURL("**/account");

  // --- Step 2: Browse for item A by title, then open its listing detail. ---
  await page.goto(`/?q=${encodeURIComponent(itemATitle)}`);
  await expect(page.getByText(itemATitle)).toBeVisible();
  await page.locator(`a[href="/listings/${listingA.id}"]`).click();
  await page.waitForURL("**/listings/**");

  // --- Step 3: Add A to the bag → redirects to `/bag`; header count = 1. ---
  await page.getByRole("button", { name: /^add to bag$/i }).click();
  await page.waitForURL("**/bag");
  // `{ exact: true }`: on `/bag` the title also appears inside the
  // "Remove <title>" BagControls button, so a substring match is ambiguous.
  await expect(page.getByText(itemATitle, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bag" }).getByText("1", { exact: true })).toBeVisible();

  // --- Step 4: Add B → redirects to `/bag`; BOTH titles, ONE bundle, count = 2. ---
  await page.goto(`/listings/${listingB.id}`);
  await page.getByRole("button", { name: /^add to bag$/i }).click();
  await page.waitForURL("**/bag");
  await expect(page.getByText(itemATitle, { exact: true })).toBeVisible();
  await expect(page.getByText(itemBTitle, { exact: true })).toBeVisible();
  // One bundle: A and B share a seller, so they land in the same bundle.
  await expect(page.locator("main > ul > li")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Bag" }).getByText("2", { exact: true })).toBeVisible();

  // --- Step 5: Over-total offer ($100 > $62) → SPECIFIC rejection; stays OPEN. ---
  await page.getByPlaceholder("Offer (USD)").fill("100");
  await page.getByRole("button", { name: /send offer/i }).click();
  await expect(
    page.getByText("Your offer can't be more than the listed total."),
  ).toBeVisible();
  // The bundle stays OPEN: the offer input is still present (editable).
  await expect(page.getByPlaceholder("Offer (USD)")).toBeVisible();

  // --- Step 6: Valid offer ($50 ≤ $62) → success → SUBMITTED ("Offer sent"). ---
  await page.getByPlaceholder("Offer (USD)").fill("50");
  await page.getByRole("button", { name: /send offer/i }).click();
  await expect(page.getByText("Offer sent")).toBeVisible();

  // === Seller phase (identity switch: clear cookies, sign in as the seller) ===
  await page.context().clearCookies();
  await signIn(page, seller.email, E2E_PASSWORD);

  // --- Step 7: Ownership guard. `canAddToBag = signedIn && viewer !== owner`,
  //         so the OWNER viewing their OWN LIVE listing must NOT see the
  //         "Add to bag" button. This realizes the symmetric "a buyer cannot
  //         add their own listing" assertion via the listing's owner. ---
  await page.goto(`/listings/${listingA.id}`);
  await expect(page.getByRole("button", { name: /add to bag/i })).toHaveCount(0);

  // --- Step 8: Accept the offer on `/sell/offers` (one offer row, shows the
  //         buyer + both items). Accept → the offer leaves the SUBMITTED list. ---
  await page.goto("/sell/offers");
  await expect(page.locator("main > ul > li")).toHaveCount(1);
  await expect(page.getByText(itemATitle)).toBeVisible();
  await expect(page.getByText(itemBTitle)).toBeVisible();
  await page.getByRole("button", { name: /accept offer/i }).click();
  // Same queue-leave pattern as admin.spec (server action → router.refresh() →
  // row leaves the list). 15s of round-trip-latency headroom over the 5s expect
  // default, since the accept action + refresh round-trip against the pooled
  // live DB can spike under contention.
  await expect(page.locator("main > ul > li")).toHaveCount(0, { timeout: 15_000 });

  // === Buyer again (identity switch back) ===
  await page.context().clearCookies();
  await signIn(page, buyerEmail, E2E_PASSWORD);
  await page.goto("/bag");
  await expect(page.getByText("Offer accepted")).toBeVisible();
});
