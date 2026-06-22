// e2e/follows.spec.ts
import { test, expect } from "@playwright/test";
import { createUser, createStorefront, createLiveListing } from "./support/factories";
import { signInAs } from "./support/auth";
import { expectZeroResidue } from "./support/expect-cleanup";

test.describe("Follow shops", () => {
  // Factory seeding spawns a tsx subprocess per call — give each test headroom.
  test.setTimeout(60_000);

  test.afterAll(async () => {
    await expectZeroResidue("follows");
  });

  test("buyer follows a shop, sees its item on /following, then unfollows", async ({ page }) => {
    const seller = await createUser({ emailTag: "fol-seller" });
    const store = await createStorefront(seller.id);
    const title = `Follow Test Romper ${Date.now()}`;
    await createLiveListing(store.id, { title });
    const buyer = await createUser({ emailTag: "fol-buyer" });

    await signInAs(page, buyer);

    // Follow from the shop page.
    await page.goto(`/store/${store.slug}`);
    const followBtn = page.getByRole("button", { name: /^follow this shop$/i });
    await expect(followBtn).toBeVisible();
    await followBtn.click();

    // Wait for the button to settle BEFORE asserting the count (the count lives
    // in the server component and updates only after the write + router.refresh).
    const unfollowBtn = page.getByRole("button", { name: /^unfollow this shop$/i });
    await expect(unfollowBtn).toBeVisible();
    await expect(unfollowBtn).toBeEnabled();
    await expect(page.getByText(/\b1 follower\b/)).toBeVisible();

    // Item shows on /following.
    await page.goto("/following");
    await expect(page.getByText(title)).toBeVisible();

    // Unfollow from the shop page.
    await page.goto(`/store/${store.slug}`);
    await page.getByRole("button", { name: /^unfollow this shop$/i }).click();
    await expect(page.getByRole("button", { name: /^follow this shop$/i })).toBeVisible();
  });

  test("anonymous follow click routes to /login", async ({ page, context }) => {
    const seller = await createUser({ emailTag: "fol-anon-seller" });
    const store = await createStorefront(seller.id);
    await createLiveListing(store.id, { title: `Anon Follow ${Date.now()}` });

    await context.clearCookies();
    await page.goto(`/store/${store.slug}`);
    await page.getByRole("button", { name: /^follow this shop$/i }).click();
    await page.waitForURL("**/login");
    await expect(page).toHaveURL(/\/login/);
  });

  test("owner does not see a Follow button on their own shop", async ({ page }) => {
    const seller = await createUser({ emailTag: "fol-owner" });
    const store = await createStorefront(seller.id);
    await createLiveListing(store.id, { title: `Owner Shop ${Date.now()}` });

    await signInAs(page, seller);
    await page.goto(`/store/${store.slug}`);
    await expect(page.getByText(/\b0 followers\b/)).toBeVisible(); // page rendered
    await expect(page.getByRole("button", { name: /^follow this shop$/i })).toHaveCount(0);
  });
});
