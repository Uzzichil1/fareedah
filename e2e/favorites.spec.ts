// e2e/favorites.spec.ts
import { test, expect } from "@playwright/test";
import { createUser, createStorefront, createLiveListing } from "./support/factories";
import { signInAs } from "./support/auth";
import { expectZeroResidue } from "./support/expect-cleanup";

test.describe("Favourites", () => {
  // Factory seeding spawns a tsx subprocess per call — give each test headroom.
  test.setTimeout(60_000);

  test.afterAll(async () => {
    await expectZeroResidue("favorites");
  });

  test("buyer favourites an item, sees it on /favourites, then unfavourites", async ({ page }) => {
    const seller = await createUser({ emailTag: "fav-seller" });
    const store = await createStorefront(seller.id);
    const title = `Fav Test Onesie ${Date.now()}`;
    const listing = await createLiveListing(store.id, { title });
    const buyer = await createUser({ emailTag: "fav-buyer" });

    await signInAs(page, buyer);

    // Favourite from the deterministic detail page.
    await page.goto(`/listings/${listing.id}`);
    await page.getByRole("button", { name: /add to favourites/i }).click();
    const removeBtn = page.getByRole("button", { name: /remove from favourites/i });
    await expect(removeBtn).toBeVisible();
    await expect(removeBtn).toBeEnabled(); // wait for the server action + router.refresh() to settle before navigating

    // It shows on /favourites.
    await page.goto("/favourites");
    await expect(page.getByText(title)).toBeVisible();

    // Unfavourite → it leaves /favourites.
    await page.goto(`/listings/${listing.id}`);
    await page.getByRole("button", { name: /remove from favourites/i }).click();
    const addBtn = page.getByRole("button", { name: /add to favourites/i });
    await expect(addBtn).toBeVisible();
    await expect(addBtn).toBeEnabled(); // same settle-wait for the reverse toggle
    await page.goto("/favourites");
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("anonymous heart click routes to /login", async ({ page, context }) => {
    const seller = await createUser({ emailTag: "fav-anon-seller" });
    const store = await createStorefront(seller.id);
    const listing = await createLiveListing(store.id, { title: `Anon Fav ${Date.now()}` });

    await context.clearCookies();
    await page.goto(`/listings/${listing.id}`);
    await page.getByRole("button", { name: /add to favourites/i }).click();
    await page.waitForURL("**/login");
    await expect(page).toHaveURL(/\/login/);
  });
});
