import { defineConfig } from "@playwright/test";

/**
 * Playwright E2E config for TinyKloset.
 *
 * IMPORTANT — port is pinned to 3000, do NOT change it:
 * `.env` sets `AUTH_URL="http://localhost:3000"`, and this app's NextAuth v5
 * production build (`next start`) issues/validates session cookies against
 * that exact origin. Running the webServer (or baseURL) on any other port
 * will silently break authentication in later test phases. So `next start`
 * (which defaults to port 3000) is exactly what we want — leave it alone.
 *
 * NOTE on `@playwright/test` version (see package.json — pinned to `1.59.1`,
 * not a caret range): this dev box already had Chromium r1217 cached from a
 * prior project, and `1.60.x` bundles Playwright's newer r1223, which would
 * force a ~180MB re-download over a very slow sandbox connection. `1.59.x`
 * bundles r1217, matching the cache exactly, so `playwright install chromium`
 * is a no-op here. Pinned exactly (not `^1.59.1`) so `npm install` can't drift
 * onto `1.60.x` and reintroduce the mismatch. Bump deliberately later — when
 * doing so, re-run `npx playwright install chromium` to fetch the new revision.
 */
export default defineConfig({
  testDir: "e2e",

  // The suite mutates a shared, live database. Specs namespace every fixture
  // they create under `e2e+...@test.tk` (see `e2e/support/factories.ts`) and
  // this removes them all once the full run completes — belt-and-braces on
  // top of any per-spec cleanup, and the last line of defense against
  // killed-run residue (see also `npm run e2e:clean`).
  globalTeardown: "./e2e/global-teardown.ts",

  // The suite mutates a shared, live database (no per-test isolation/fixtures
  // yet — those land in a later task), so tests must run sequentially in a
  // single worker, never in parallel.
  fullyParallel: false,
  workers: 1,
  // `retries` is intentionally left at the default of 0 for the same reason as
  // the single worker: re-running a test that already wrote to the shared live
  // DB risks double-inserts / unique-constraint collisions on the retry.

  reporter: "list",

  use: {
    // Allow overriding for ad-hoc runs against a different deployment, but
    // default to the local prod server started below (port 3000, see note).
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",

    // Failure-debugging affordances for later specs (B3-B6) that run against
    // the live DB: capture a screenshot and a Playwright trace only when a test
    // fails (not `on-first-retry` — retries are 0, so that would never fire).
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  webServer: {
    // Build then start the production server. `next start` requires a build
    // to exist first; rebuilding on every run is slower but correct and
    // avoids stale-build false negatives. The port is pinned explicitly with
    // `-p 3000` rather than relying on next's default, because `next start`
    // honours an inherited `PORT` env var (default: 3000, env: PORT) — without
    // the explicit flag, a stray `PORT` could silently move the server off 3000
    // while `url`/`baseURL` below stay on 3000, breaking the health check (and
    // auth — see the AUTH_URL note above).
    command: "npm run build && npx next start -p 3000",
    url: "http://localhost:3000",
    // Locally, reuse a server that's already running on :3000 (e.g. `npm run
    // dev` or a previous `npm run start`) so we don't rebuild on every run.
    // In CI, always start a fresh server.
    reuseExistingServer: !process.env.CI,
    // The build can take a while — give it a generous timeout.
    timeout: 180_000,
    env: {
      // Defense-in-depth for prod auth in later (auth-covering) tasks: makes
      // NextAuth trust the host header so cookies/redirects resolve against
      // AUTH_URL=http://localhost:3000 above. Secrets are NOT hardcoded here;
      // Next.js loads `.env` itself when the server process starts.
      AUTH_TRUST_HOST: "true",
    },
  },
});
