// auth.ts — drives the real `/login` UI to authenticate fixture users.
//
// Pure Playwright UI automation — imports nothing Prisma-related, so it loads
// fine under the runner's transform (unlike `src/lib/db`; see the note atop
// `scripts/e2e-db.ts`).
//
// `src/components/auth/LoginForm.tsx` renders `<Label htmlFor="email">` /
// `<Input id="email">` and `<Label htmlFor="password">` / `<Input id="password">`
// (label-associated via matching id), with a submit button labelled "Log in".
// On success, `loginAction` redirects to `/account`.
import type { Page } from "@playwright/test";
import type { E2EUser } from "./factories";
import { E2E_PASSWORD } from "./factories";

/** Fills and submits the real `/login` form, then waits for the post-login
 *  redirect to `/account`. */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL("**/account");
}

/** Convenience wrapper for fixtures created via `createUser` — they all share
 *  `E2E_PASSWORD` (see `factories.ts`). */
export async function signInAs(page: Page, user: Pick<E2EUser, "email">): Promise<void> {
  await signIn(page, user.email, E2E_PASSWORD);
}
