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

  // The suite mutates a shared, live database (no per-test isolation/fixtures
  // yet — those land in a later task), so tests must run sequentially in a
  // single worker, never in parallel.
  fullyParallel: false,
  workers: 1,

  reporter: "list",

  use: {
    // Allow overriding for ad-hoc runs against a different deployment, but
    // default to the local prod server started below (port 3000, see note).
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
  },

  webServer: {
    // Build then start the production server. `next start` requires a build
    // to exist first; rebuilding on every run is slower but correct and
    // avoids stale-build false negatives. `next start` defaults to port 3000.
    command: "npm run build && npm run start",
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
