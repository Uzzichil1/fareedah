# Groundwork — Revert Stripe 4b + Switch to ZAR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the obsolete Stripe Connect (Phase 4b) integration and switch the marketplace's currency from USD to ZAR, as groundwork before building payments on Stitch.

**Architecture:** Two mechanical passes — (A) delete the Stripe 4b files + edit the seller dashboard + drop the stripe `Storefront` columns; (B) rewrite `money.ts` to ZAR helpers (`parseZar`/`formatZar`, symbol now inside `formatZar`), sweep all call sites, and change the `Listing.currency` default. Integer-cents storage and all money math are unchanged (R1 = 100 cents). One combined migration covers both schema changes.

**Tech Stack:** Next.js 16 (App Router), Prisma 7 (live Supabase dev DB via `DIRECT_URL`), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-24-zar-groundwork-design.md`

## Global Constraints
- **Migration guardrail (execution-critical):** the combined migration DROPs 3 columns + changes a default + UPDATEs existing rows on the live **dev** DB. Confirm `DIRECT_URL` is dev. **If `prisma migrate dev` proposes a database RESET / reports drift → STOP and escalate; never accept a reset.**
- **Storage unchanged:** `priceCents`/`offerCents` stay integer cents; do NOT re-price any data. ZAR is display/label only.
- **`formatZar` includes the `R`** — call sites must drop the old literal `$` (don't render `$R120.00`).
- **Preserve invariants:** the `/sell` dashboard `main ul > li` E2E counts listings only (removing the banner `<div>` keeps this true); public listing queries stay LIVE-pinned (untouched here).
- **Demo data re-labeled, not re-priced.** Drop all 3 stripe columns (`stripeAccountId`, `stripeChargesEnabled`, `stripePayoutsEnabled`).
- Verification honesty: this sub-project is fully runtime-verifiable locally (no external creds).

---

### Task 1: Revert the Stripe 4b integration (no migration yet)

**Files:**
- Delete: `src/lib/stripe.ts`, `src/lib/stripe-onboarding.ts`, `src/lib/stripe-onboarding.test.ts`, `src/app/sell/payouts/` (entire tree: `page.tsx`, `actions.ts`, `return/page.tsx`, `refresh/page.tsx`), `src/components/sell/PayoutsPanel.tsx`, `src/app/api/stripe/webhook/route.ts` (and the now-empty `src/app/api/stripe/`), `e2e/payouts.spec.ts`
- Modify: `src/app/sell/page.tsx`, `package.json`/`package-lock.json` (via npm)

- [ ] **Step 1: Delete the Stripe files**

```bash
git rm src/lib/stripe.ts src/lib/stripe-onboarding.ts src/lib/stripe-onboarding.test.ts \
  src/components/sell/PayoutsPanel.tsx e2e/payouts.spec.ts
git rm -r src/app/sell/payouts src/app/api/stripe
```
(If `src/app/api/` is now empty, leave it — Next ignores empty dirs; `git rm -r src/app/api/stripe` removes only the stripe subtree.)

- [ ] **Step 2: Remove the payouts banner from the seller dashboard**

Open `src/app/sell/page.tsx`. Remove, in this file only:
- the `import { onboardingState } from "@/lib/stripe-onboarding";` line (and the `buttonClasses` import IF it was added solely for the banner and is otherwise unused — check; if `buttonClasses` is used elsewhere in the file, keep it);
- the `prisma.storefront.findUniqueOrThrow({ … select: { stripeAccountId, stripeChargesEnabled, stripePayoutsEnabled } })` query and the `const payoutState = onboardingState({…})` block;
- the `{payoutState !== "enabled" && ( <div …banner…> )}` JSX block.
Leave the rest of the dashboard (listings query + render) exactly as it was pre-4b. Do not introduce a nested `<ul>`.

- [ ] **Step 3: Uninstall the Stripe SDK**

```bash
npm uninstall stripe
```
Expected: `stripe` removed from `package.json` dependencies and `package-lock.json` updated. (Locally also remove `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` from `.env` — gitignored, not committed.)

- [ ] **Step 4: Typecheck/lint to confirm nothing still imports the deleted modules**

Run: `npm run lint && npx tsc --noEmit`
Expected: clean. If tsc reports a dangling import of any deleted Stripe module, that's a reference you missed — remove it. (`prisma/schema.prisma` still has the stripe columns at this point; that's fine — nothing reads them now, and they're dropped in Task 4.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "revert(4b): remove Stripe Connect onboarding (moving to Stitch)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `money.ts` → `parseZar`/`formatZar` (TDD)

**Files:**
- Modify: `src/lib/money.ts`
- Test: `src/lib/money.test.ts`

**Interfaces:**
- Produces: `parseZar(input: string): number | null`, `formatZar(cents: number): string` (returns e.g. `"R120.00"` — symbol included). Removes `dollarsToCents`/`centsToDollars`.

- [ ] **Step 1: Rewrite the test first**

Replace `src/lib/money.test.ts` contents:
```ts
import { describe, it, expect } from "vitest";
import { parseZar, formatZar } from "./money";

describe("parseZar", () => {
  it("parses whole and decimal Rand to integer cents", () => {
    expect(parseZar("120")).toBe(12000);
    expect(parseZar("120.50")).toBe(12050);
    expect(parseZar("0.05")).toBe(5);
  });
  it("rejects invalid input", () => {
    expect(parseZar("abc")).toBeNull();
    expect(parseZar("1.234")).toBeNull();
    expect(parseZar("")).toBeNull();
    expect(parseZar("-5")).toBeNull();
  });
});

describe("formatZar", () => {
  it("formats integer cents as Rand with the R symbol", () => {
    expect(formatZar(12000)).toBe("R120.00");
    expect(formatZar(12050)).toBe("R120.50");
    expect(formatZar(0)).toBe("R0.00");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- money`
Expected: FAIL — `parseZar`/`formatZar` are not exported (still `dollarsToCents`/`centsToDollars`).

- [ ] **Step 3: Rewrite `src/lib/money.ts`**

```ts
/** Parse a Rand string to integer cents, or null if invalid. No float math. */
export function parseZar(input: string): number | null {
  const t = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** Format integer cents as a ZAR amount, e.g. 12000 → "R120.00". */
export function formatZar(cents: number): string {
  return `R${(cents / 100).toFixed(2)}`;
}
```

- [ ] **Step 4: Run the money test**

Run: `npm test -- money`
Expected: PASS. (The full suite will fail to typecheck until Task 3 updates the call sites — that's expected; do NOT run the full suite yet.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts
git commit -m "feat(zar): money.ts → parseZar/formatZar (R symbol in formatter)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Sweep all call sites to ZAR + labels

**Files (modify):** `src/app/sell/page.tsx`, `src/components/sell/OfferActions.tsx`, `src/components/bag/BagControls.tsx`, `src/app/sell/offers/page.tsx`, `src/app/sell/offers/actions.ts`, `src/app/bag/page.tsx`, `src/app/bag/actions.ts`, `src/app/listings/[id]/page.tsx`, `src/components/listings/ListingCard.tsx`, `src/app/sell/listings/[id]/edit/page.tsx`, `src/app/admin/page.tsx`, `src/app/sell/actions.ts`, `src/components/sell/ListingForm.tsx`, `src/lib/listing-query.ts` — plus any `e2e/*.spec.ts` that assert money amounts.

This is a mechanical sweep. Apply these transformations in every file that imports from `@/lib/money`:

- [ ] **Step 1: Find every call site**

Run: `npx tsc --noEmit` (it will error on every file still importing `centsToDollars`/`dollarsToCents`) and/or grep:
Use the Grep tool for `centsToDollars|dollarsToCents` in `src/` to get the exact list.

- [ ] **Step 2: Apply the transformations per file**

For each file:
1. Update the import: `import { centsToDollars } from "@/lib/money"` → `import { formatZar } from "@/lib/money"` (and/or `dollarsToCents` → `parseZar`). Keep only what the file uses.
2. **Display:** replace `${centsToDollars(EXPR)}` (a literal `$` immediately before the call, inside JSX or a template string) with `{formatZar(EXPR)}` (JSX) or `` `${formatZar(EXPR)}` `` (template string) — i.e. **delete the now-duplicate `$`** because `formatZar` already returns the `R`. Example (ListingCard): `` `$${centsToDollars(listing.priceCents)}` `` → `formatZar(listing.priceCents)`; JSX `${centsToDollars(x)}` → `{formatZar(x)}`.
3. **Parse:** `dollarsToCents(EXPR)` → `parseZar(EXPR)`.
4. **Labels:** any user-facing "USD"/"$"/"dollar" text → ZAR/Rand/"R": input `placeholder="Offer (USD)"`/`"Offer (R)"`? use `"Offer (R)"`; `aria-label="Offer amount in USD"` → `"Offer amount in Rand"`; `aria-label="Counter amount in USD"` → `"Counter amount in Rand"`; the listing-price input label in `ListingForm.tsx`/edit page → "Price (R)" / "Price in Rand". Match the existing wording, only swapping the currency token.

> Note `src/lib/listing-query.ts`: it uses `dollarsToCents` for the `priceMin`/`priceMax` filter parsing — swap to `parseZar`. No `$` rendering there.

- [ ] **Step 3: Update E2E money assertions**

Use Grep for `\$\d` and `USD` in `e2e/`. Any spec asserting a dollar amount (e.g. `getByText(/\$120/)`) must become the Rand form (`/R120/`). The counter-offer spec asserts an agreed amount (`/\$58(\.00)?/` or similar) — update to `/R58(\.00)?/`. (The favourites/follows specs assert follower/price text — check and update any `$`.)

- [ ] **Step 4: Completeness grep gate**

Run Grep in `src/` for `centsToDollars|dollarsToCents|\(USD\)|in USD|"USD"` → expect **zero** matches. Then a manual scan for a money-adjacent literal `$` (`\$\{?\s*formatZar` would be a bug — there must be no `$` immediately before `formatZar`).

- [ ] **Step 5: Lint + typecheck + build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: green; route table no longer lists `/sell/payouts*` or `/api/stripe/webhook` (deleted in Task 1).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(zar): sweep call sites to formatZar/parseZar + Rand labels

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Combined migration — drop stripe columns + ZAR currency default

**Files:**
- Modify: `prisma/schema.prisma`
- Generated: a new `prisma/migrations/<timestamp>_drop_stripe_and_zar/`

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`:
1. In `model Storefront`, DELETE these three lines:
   - `stripeAccountId String?`
   - `stripeChargesEnabled Boolean @default(false)`
   - `stripePayoutsEnabled Boolean @default(false)`
2. In `model Listing`, change `currency String @default("USD")` → `currency String @default("ZAR")`.

- [ ] **Step 2: Confirm dev target**

Run: `npx prisma migrate status`
Expected: connects to the dev project, no error. Confirm it's dev before proceeding.

- [ ] **Step 3: Create the migration (do NOT apply blindly — inspect first)**

Run: `npm run db:migrate -- --name drop_stripe_and_zar`
Expected: Prisma generates `migration.sql` with `ALTER TABLE "Storefront" DROP COLUMN …` (×3) and `ALTER TABLE "Listing" ALTER COLUMN "currency" SET DEFAULT 'ZAR'`, applies it, and runs `prisma generate`.
**If it proposes a RESET or reports drift → STOP and escalate. Do NOT accept a reset.**

- [ ] **Step 4: Backfill existing rows' currency**

Prisma's default change does NOT update existing rows. Append this line to the generated `prisma/migrations/<timestamp>_drop_stripe_and_zar/migration.sql`:
```sql
UPDATE "Listing" SET "currency" = 'ZAR' WHERE "currency" = 'USD';
```
Then re-apply so the statement runs against the dev DB:
Run: `npx prisma migrate dev`
Expected: detects the edited (unapplied tail of the) migration or reports in-sync; if Prisma considers the migration already applied, instead run the UPDATE once directly via a one-off: `npx prisma db execute --file prisma/migrations/<timestamp>_drop_stripe_and_zar/migration.sql --schema prisma/schema.prisma` is NOT idempotent for the DDL — so prefer: run only the UPDATE via `npx prisma db execute --stdin --schema prisma/schema.prisma` piping the single `UPDATE "Listing" …;` statement. Confirm with a quick `SELECT DISTINCT currency FROM "Listing";` (via `prisma db execute` or the Supabase SQL editor) → only `ZAR`.

> Simpler alternative if the above is fiddly: add the `UPDATE` line to `migration.sql` BEFORE first `migrate dev` apply (i.e., generate the migration with `--create-only`: `npx prisma migrate dev --name drop_stripe_and_zar --create-only`, edit the SQL to append the `UPDATE`, then `npx prisma migrate dev` to apply the whole file once). This is the cleaner path — use `--create-only` so the DDL + the UPDATE apply together in one go.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: green; the generated client no longer has the stripe `Storefront` fields, and nothing references them (Task 1 already removed all readers).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(zar): drop stripe Storefront columns + Listing.currency default ZAR (migration)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Full green gate

**Files:** (none — verification only)

- [ ] **Step 1: Grep gates clean**

Grep `src/` for `centsToDollars|dollarsToCents|"USD"|\(USD\)|in USD` → zero matches. Grep `src/` for `from "@/lib/stripe` or `stripe-onboarding` or `PayoutsPanel` → zero matches.

- [ ] **Step 2: Run everything (port 3000 free of `next dev`)**

- `npm run lint` → clean
- `npm test` → all green (report the new total; it drops by the 3 removed `stripe-onboarding` tests, money tests adjust)
- `npm run build` → green; route table has NO `/sell/payouts*` or `/api/stripe/webhook`
- `npm run test:e2e` → all green, 0 residue (report the new total; `payouts.spec.ts` removed = −3 tests; any `$`→`R` assertion updates from Task 3 hold)

- [ ] **Step 3: Confirm the dashboard + prices render in ZAR**

Spot-check (in the report): `ListingCard`, `/listings/[id]`, `/bag`, `/sell/offers` all render `R…` amounts; the seller dashboard has no payouts banner.

- [ ] **Step 4: (No commit — verification only.)** Then use `superpowers:finishing-a-development-branch`.

---

## Self-review notes (coverage of the spec)
- Revert Stripe 4b (delete files, edit dashboard, uninstall dep) → Task 1; drop columns → Task 4.
- `money.ts` ZAR helpers (TDD) → Task 2.
- Call-site sweep + labels + E2E `$`→`R` + grep gate → Task 3.
- `Listing.currency` default ZAR + existing-row backfill, single combined migration (guardrailed) → Task 4.
- Full green + grep gates → Task 5.
- Decisions honored: drop all 3 stripe columns; re-label (not re-price) demo data; storage/math unchanged.
