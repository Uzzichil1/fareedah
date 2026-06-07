import { test, expect } from "@playwright/test";
import { E2E_PASSWORD } from "./support/constants";
import { cleanupE2EData, countE2EData } from "./support/cleanup";

/**
 * B3 — Seller journey spec (the first real end-to-end UI journey).
 *
 * Sign up → open storefront (`/sell/start`) → create a listing on the NEW
 * form → attempt submit with an 8-char description → assert the SPECIFIC
 * "Description must be at least 10 characters" rule (A1) → fix → submit →
 * listing is PENDING_REVIEW ("In review") → assert exactly ONE listing row
 * exists (A2).
 *
 * Uses the REAL signup UI (the plan says "Sign up"), not the `createUser`
 * factory. The seller is namespaced `e2e+...@test.tk`, so `globalTeardown`
 * removes it (cascading storefront → listing → image). An `afterAll` runs
 * `cleanupE2EData` as belt-and-suspenders.
 *
 * --- Why the A2 count assertion actually discriminates the bug (DO NOT
 * re-navigate between the two submits): `ListingForm.run` creates ONE DRAFT
 * row on the first (failing) click and stashes its id in React state
 * (`createdId`). The second click sees `createdId` set, so it UPDATES that
 * same row and submits — net one row that ends PENDING_REVIEW. If anything
 * reloads/navigates the page between the two clicks, `createdId` resets and
 * the second click creates a SECOND draft (2 rows). So this spec keeps a
 * single page instance and only refills `#description` in place between the
 * two clicks — that's the whole point of the count=1 assertion. ---
 *
 * --- Cloudinary upload mock (the pattern later specs reuse): the SERVER-SIDE
 * `createUploadSignature()` action runs against `.env` creds (no network);
 * only the BROWSER's POST to `api.cloudinary.com/.../image/upload` is mocked.
 * `listingSubmitSchema` requires `images.min(1)`, so without a successful
 * upload submit would fail on "Add at least one image" instead of the
 * description rule. We register the route BEFORE `setInputFiles`, then wait on
 * the rendered "Remove image" button (proving the async upload resolved into
 * form state) before submitting. ---
 */

const CLOUDINARY_UPLOAD_GLOB = "**/api.cloudinary.com/**/image/upload";
const MOCK_UPLOAD_RESPONSE = {
  secure_url: "https://res.cloudinary.com/demo/image/upload/e2e-test.jpg",
  public_id: "e2e-test",
};

test.afterAll(async () => {
  const deleted = await cleanupE2EData();
  console.log("[seller.spec] cleanupE2EData deleted:", deleted);
  expect(await countE2EData()).toEqual({
    bundleItems: 0,
    bundles: 0,
    listings: 0,
    storefronts: 0,
    users: 0,
  });
});

test("seller signs up, opens a storefront, and the submit-validation flow leaves exactly one PENDING_REVIEW listing", async ({ page }) => {
  const email = `e2e+seller-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.tk`;

  // --- Step 1: Sign up via the real `/signup` UI. signupAction auto-signs-in
  //         and redirects to `/account`. ---
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Seller");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /sign up/i }).click();
  await page.waitForURL("**/account");

  // --- Step 2: Open the storefront via `/sell/start`. On success
  //         `createStorefront` redirects to `/sell` (the dashboard). ---
  await page.goto("/sell/start");
  await page.locator("#name").fill("E2E Closet");
  await page.getByRole("button", { name: /open my storefront/i }).click();
  await page.waitForURL("**/sell");

  // --- Step 3: Create a listing via the NEW form (no listingId — the A2 path). ---
  await page.getByRole("link", { name: /new listing/i }).click();
  await page.waitForURL("**/sell/listings/new");

  // Register the Cloudinary browser-POST mock BEFORE triggering the upload.
  await page.route(CLOUDINARY_UPLOAD_GLOB, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_UPLOAD_RESPONSE),
    })
  );

  // Fill everything VALID except description, so the ONLY rule that can fail
  // on the first submit is the description-length rule.
  await page.locator("#title").fill("Formal shirt");
  await page.locator("#priceDollars").fill("12.50");
  await page.locator("#categoryId").selectOption({ index: 1 });
  await page.locator("#conditionId").selectOption({ index: 1 });

  // Attach an in-memory image. The real upload is mocked; a tiny non-empty
  // buffer is enough. The file input is `sr-only` but setInputFiles works on
  // hidden inputs.
  await page.locator('input[type="file"]').setInputFiles({
    name: "e2e.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  // `handleFiles` is async (server-action signature + mocked fetch). Wait for
  // the thumbnail's remove button — proves the upload landed in form state.
  await expect(page.getByRole("button", { name: "Remove image" })).toBeVisible();

  // First submit: description is EXACTLY 8 chars → only the description rule
  // fails. Assert the SPECIFIC per-rule message (A1).
  await page.locator("#description").fill("Eid spec");
  await page.getByRole("button", { name: /submit for review/i }).click();
  await expect(
    page.getByText("Description must be at least 10 characters")
  ).toBeVisible();

  // We must still be on the new-listing form (no redirect on a failed submit);
  // a navigation here would reset `createdId` and break the A2 invariant.
  await expect(page).toHaveURL(/\/sell\/listings\/new(?:[/?#]|$)/);

  // Fix ONLY the description in place (15 chars), then submit again. The form
  // reuses the same DRAFT row (createdId) → updates + submits it.
  await page.locator("#description").fill("Eid speculation");
  await page.getByRole("button", { name: /submit for review/i }).click();

  // On success `submitListing` redirects to `/sell`. `**/sell` does NOT match
  // `/sell/start` or `/sell/listings/new`, so this wait is unambiguous.
  await page.waitForURL("**/sell");

  // --- Step 4: Assert PENDING_REVIEW + the A2 single-row invariant. ---
  // A2 MUST be a COUNT (a visibility check would pass even with an orphan
  // DRAFT row, defeating B3's purpose).
  await expect(page.locator("main ul > li")).toHaveCount(1);
  // The row shows the title and the PENDING_REVIEW badge LABEL "In review"
  // (not the enum). If this ever shows "Draft" with count=1, that's the
  // createdId-reset bug surfacing.
  await expect(page.getByText("Formal shirt")).toBeVisible();
  await expect(page.getByText("In review")).toBeVisible();
});
