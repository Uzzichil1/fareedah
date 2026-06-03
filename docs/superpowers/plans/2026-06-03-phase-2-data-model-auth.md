# Phase 2 — Data Model + Auth.js Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the complete TinyKloset Prisma data model and Auth.js v5 authentication (email/password + Google, capability-based roles, JWT sessions, proxy + DAL authorization) on the Phase 1 scaffold.

**Architecture:** Auth.js v5 with the Prisma adapter and **JWT** sessions (forced by the Credentials provider); `role` is carried in the JWT. Optimistic route protection lives in `proxy.ts` (Next 16's renamed middleware, Node.js runtime); secure authorization lives in a Data Access Layer (`src/lib/dal.ts`) called close to data. The full data model replaces the `HealthCheck` placeholder in a single migration applied to Supabase.

**Tech Stack:** Next.js 16.2.7 (App Router, Turbopack), React 19.2, Prisma 7.8 (`prisma-client` generator → `src/generated/prisma`, driver adapters), `next-auth@5.0.0-beta.31`, `@auth/prisma-adapter`, `bcryptjs`, `zod`, `react-hook-form`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-06-03-phase-2-data-model-auth-design.md` (read it first).

**Critical environment note:** This is a **deliberately modified Next.js 16**. Middleware is renamed **Proxy** (`proxy.ts`, Node.js runtime, optimistic checks only). Before writing the proxy/auth wiring, read `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` and `node_modules/next/dist/docs/01-app/02-guides/authentication.md`. Prisma connection URLs live in `prisma.config.ts` / the runtime adapter, never in `schema.prisma`. The worktree's `.env` (copied from the main checkout) holds live Supabase credentials. `@/` resolves to `src/`.

---

## File Structure

**Created:**
- `vitest.config.ts` — Vitest config with tsconfig path resolution.
- `src/lib/password.ts` — `hashPassword` / `verifyPassword` (bcryptjs).
- `src/lib/password.test.ts` — unit tests.
- `src/lib/authz.ts` — pure authorization decision helpers (`isAdmin`, etc.).
- `src/lib/authz.test.ts` — unit tests.
- `src/lib/validation/auth.ts` — Zod `signupSchema` / `loginSchema`.
- `src/lib/validation/auth.test.ts` — unit tests.
- `src/auth.ts` — Auth.js config (`handlers`, `signIn`, `signOut`, `auth`).
- `src/types/next-auth.d.ts` — session/JWT type augmentation.
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handler.
- `src/lib/dal.ts` — Data Access Layer (`verifySession`, `getCurrentUser`, `requireAdmin`, `requireSeller`).
- `proxy.ts` — optimistic route protection (repo root).
- `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx` — auth pages.
- `src/components/auth/LoginForm.tsx`, `src/components/auth/SignupForm.tsx` — RHF client forms.
- `src/app/actions/auth.ts` — `signupAction`, `loginAction`, `logoutAction` server actions.
- `src/app/account/page.tsx` — protected page (demonstrates DAL).
- `src/app/admin/page.tsx` — admin-only page (demonstrates `requireAdmin` + proxy).

**Modified:**
- `package.json` — new deps + `test`/`test:watch` scripts.
- `prisma/schema.prisma` — full data model (remove `HealthCheck`).
- `prisma/migrations/**` — initial migration (generated).
- `.env.example` / `README.md` — doc updates.

---

## Task 1: Install dependencies and set up Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/smoke.test.ts` (temporary)

- [ ] **Step 1: Install runtime + dev dependencies**

Run:
```bash
npm install next-auth@5.0.0-beta.31 @auth/prisma-adapter bcryptjs zod react-hook-form @hookform/resolvers
npm install -D vitest vite-tsconfig-paths @types/bcryptjs
```
Expected: installs succeed. `next-auth@beta` peer-supports `next ^16`, so no peer error. (If npm reports a hard peer conflict, stop and report — do NOT use `--force`.)

- [ ] **Step 2: Add test scripts to package.json**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write a smoke test**

Create `src/lib/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest setup", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the smoke test**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 6: Delete the smoke test and commit**

Run:
```bash
rm src/lib/smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "Add auth/validation deps and Vitest setup"
```

---

## Task 2: Password hashing helper (TDD)

**Files:**
- Create: `src/lib/password.ts`
- Test: `src/lib/password.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/password.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("hashes a password to something other than the plaintext", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).not.toBe("correct horse battery");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("s3cret-pass!");
    expect(await verifyPassword("s3cret-pass!", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("s3cret-pass!");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/password.test.ts`
Expected: FAIL (cannot resolve `./password`).

- [ ] **Step 3: Implement the helper**

Create `src/lib/password.ts`:
```ts
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/password.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

Run:
```bash
git add src/lib/password.ts src/lib/password.test.ts
git commit -m "Add bcryptjs password hashing helper"
```

---

## Task 3: Authorization decision helpers (TDD)

These are pure functions so the role/capability logic is unit-testable independent of sessions and the database. The DAL (Task 8) composes them.

**Files:**
- Create: `src/lib/authz.ts`
- Test: `src/lib/authz.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/authz.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isAdmin, canAccessAdminArea } from "./authz";

describe("authorization decisions", () => {
  it("isAdmin is true only for ADMIN", () => {
    expect(isAdmin("ADMIN")).toBe(true);
    expect(isAdmin("USER")).toBe(false);
  });

  it("canAccessAdminArea matches isAdmin", () => {
    expect(canAccessAdminArea("ADMIN")).toBe(true);
    expect(canAccessAdminArea("USER")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/authz.test.ts`
Expected: FAIL (cannot resolve `./authz`).

- [ ] **Step 3: Implement the helpers**

Create `src/lib/authz.ts`. Use a local string-literal union so this file has no dependency on the generated Prisma client (the enum is mirrored; Task 5 defines the matching Prisma `Role`):
```ts
export type Role = "USER" | "ADMIN";

export function isAdmin(role: Role): boolean {
  return role === "ADMIN";
}

export function canAccessAdminArea(role: Role): boolean {
  return isAdmin(role);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/authz.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

Run:
```bash
git add src/lib/authz.ts src/lib/authz.test.ts
git commit -m "Add pure authorization decision helpers"
```

---

## Task 4: Zod auth validation schemas (TDD)

**Files:**
- Create: `src/lib/validation/auth.ts`
- Test: `src/lib/validation/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/validation/auth.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { signupSchema, loginSchema } from "./auth";

describe("signupSchema", () => {
  it("accepts a valid signup", () => {
    const r = signupSchema.safeParse({
      name: "Ada",
      email: "ada@example.com",
      password: "Str0ng!pass",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a weak password", () => {
    const r = signupSchema.safeParse({
      name: "Ada",
      email: "ada@example.com",
      password: "weak",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const r = signupSchema.safeParse({
      name: "Ada",
      email: "not-an-email",
      password: "Str0ng!pass",
    });
    expect(r.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts email + password", () => {
    const r = loginSchema.safeParse({
      email: "ada@example.com",
      password: "anything",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing password", () => {
    const r = loginSchema.safeParse({ email: "ada@example.com" });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/validation/auth.test.ts`
Expected: FAIL (cannot resolve `./auth`).

- [ ] **Step 3: Implement the schemas**

Create `src/lib/validation/auth.ts`:
```ts
import { z } from "zod";

const password = z
  .string()
  .min(8, "Be at least 8 characters long")
  .regex(/[a-zA-Z]/, "Contain at least one letter")
  .regex(/[0-9]/, "Contain at least one number")
  .regex(/[^a-zA-Z0-9]/, "Contain at least one special character");

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").trim(),
  email: z.string().email("Please enter a valid email").trim().toLowerCase(),
  password,
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email").trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/validation/auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

Run:
```bash
git add src/lib/validation/auth.ts src/lib/validation/auth.test.ts
git commit -m "Add Zod auth validation schemas"
```

---

## Task 5: Full Prisma data model

Write the entire data model in one file (it is heavily cross-referential, so partial schemas do not validate). Remove `HealthCheck`. Note the dropped `Session` table risk in Step 2.

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Replace the model section of `prisma/schema.prisma`**

Keep the existing header comment, `generator client { ... }`, and `datasource db { provider = "postgresql" }` blocks. Replace the `HealthCheck` model with everything below:

```prisma
// ----------------------------------------------------------------------------
// Identity / auth (Auth.js adapter tables + TinyKloset extensions)
// ----------------------------------------------------------------------------

enum Role {
  USER
  ADMIN
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  passwordHash  String?
  name          String?
  image         String?
  role          Role      @default(USER)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  accounts            Account[]
  storefront          Storefront?
  orders              Order[]
  bundles             Bundle[]
  favorites           Favorite[]
  sentMessages        Message[]
  buyerConversations  Conversation[] @relation("BuyerConversations")
  sellerConversations Conversation[] @relation("SellerConversations")
}

model Account {
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([provider, providerAccountId])
  @@index([userId])
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@id([identifier, token])
}

// ----------------------------------------------------------------------------
// Catalog / taxonomy
// ----------------------------------------------------------------------------

enum StorefrontStatus {
  ACTIVE
  SUSPENDED
  CLOSED
}

enum ListingStatus {
  DRAFT
  PENDING_REVIEW
  APPROVED
  REJECTED
  LIVE
  SOLD
  ARCHIVED
}

model Category {
  id       String  @id @default(cuid())
  name     String
  slug     String  @unique
  parentId String?

  parent   Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  children Category[] @relation("CategoryTree")
  listings Listing[]
  sizes    Size[]

  @@index([parentId])
}

model Condition {
  id        String    @id @default(cuid())
  name      String
  slug      String    @unique
  sortOrder Int       @default(0)
  listings  Listing[]
}

model Size {
  id         String  @id @default(cuid())
  label      String
  sortOrder  Int     @default(0)
  categoryId String?

  category Category?  @relation(fields: [categoryId], references: [id])
  listings Listing[]

  @@unique([label, categoryId])
  @@index([categoryId])
}

model Brand {
  id       String    @id @default(cuid())
  name     String    @unique
  slug     String    @unique
  listings Listing[]
}

model Storefront {
  id              String           @id @default(cuid())
  userId          String           @unique
  slug            String           @unique
  name            String
  bio             String?
  avatarUrl       String?
  bannerUrl       String?
  status          StorefrontStatus @default(ACTIVE)
  stripeAccountId String?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  user       User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  listings   Listing[]
  orderItems OrderItem[]
  bundles    Bundle[]
}

model Listing {
  id           String        @id @default(cuid())
  storefrontId String
  title        String
  description  String
  priceCents   Int
  currency     String        @default("USD")
  brandId      String?
  categoryId   String
  conditionId  String
  sizeId       String?
  status       ListingStatus @default(DRAFT)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  storefront  Storefront     @relation(fields: [storefrontId], references: [id], onDelete: Cascade)
  brand       Brand?         @relation(fields: [brandId], references: [id])
  category    Category       @relation(fields: [categoryId], references: [id])
  condition   Condition      @relation(fields: [conditionId], references: [id])
  size        Size?          @relation(fields: [sizeId], references: [id])
  images      ListingImage[]
  favorites   Favorite[]
  orderItems  OrderItem[]
  bundleItems BundleItem[]

  @@index([storefrontId])
  @@index([categoryId])
  @@index([brandId])
  @@index([status])
}

model ListingImage {
  id        String @id @default(cuid())
  listingId String
  url       String
  position  Int    @default(0)

  listing Listing @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@index([listingId])
}

// ----------------------------------------------------------------------------
// Commerce
// ----------------------------------------------------------------------------

enum OrderStatus {
  PENDING
  PAID
  SHIPPED
  DELIVERED
  COMPLETED
  CANCELLED
  REFUNDED
}

enum BundleStatus {
  OPEN
  SUBMITTED
  ACCEPTED
  DECLINED
  CHECKED_OUT
}

model Order {
  id                    String      @id @default(cuid())
  buyerId               String
  status                OrderStatus @default(PENDING)
  subtotalCents         Int
  commissionCents       Int         @default(0)
  shippingCents         Int         @default(0)
  totalCents            Int
  currency              String      @default("USD")
  stripePaymentIntentId String?
  shipName              String?
  shipLine1             String?
  shipLine2             String?
  shipCity              String?
  shipState             String?
  shipPostalCode        String?
  shipCountry           String?
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt

  buyer User        @relation(fields: [buyerId], references: [id])
  items OrderItem[]

  @@index([buyerId])
  @@index([status])
}

model OrderItem {
  id           String @id @default(cuid())
  orderId      String
  listingId    String
  storefrontId String
  priceCents   Int
  quantity     Int    @default(1)

  order      Order      @relation(fields: [orderId], references: [id], onDelete: Cascade)
  listing    Listing    @relation(fields: [listingId], references: [id])
  storefront Storefront @relation(fields: [storefrontId], references: [id])

  @@index([orderId])
  @@index([listingId])
  @@index([storefrontId])
}

model Bundle {
  id           String       @id @default(cuid())
  buyerId      String
  storefrontId String
  status       BundleStatus @default(OPEN)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  buyer      User         @relation(fields: [buyerId], references: [id])
  storefront Storefront   @relation(fields: [storefrontId], references: [id])
  items      BundleItem[]

  @@index([buyerId])
  @@index([storefrontId])
}

model BundleItem {
  id        String @id @default(cuid())
  bundleId  String
  listingId String

  bundle  Bundle  @relation(fields: [bundleId], references: [id], onDelete: Cascade)
  listing Listing @relation(fields: [listingId], references: [id])

  @@unique([bundleId, listingId])
  @@index([listingId])
}

// ----------------------------------------------------------------------------
// Social / messaging
// ----------------------------------------------------------------------------

model Conversation {
  id        String   @id @default(cuid())
  buyerId   String
  sellerId  String
  listingId String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  buyer    User      @relation("BuyerConversations", fields: [buyerId], references: [id])
  seller   User      @relation("SellerConversations", fields: [sellerId], references: [id])
  messages Message[]

  @@unique([buyerId, sellerId, listingId])
  @@index([buyerId])
  @@index([sellerId])
}

model Message {
  id             String    @id @default(cuid())
  conversationId String
  senderId       String
  body           String
  readAt         DateTime?
  createdAt      DateTime  @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       User         @relation(fields: [senderId], references: [id])

  @@index([conversationId])
  @@index([senderId])
}

model Favorite {
  id        String   @id @default(cuid())
  userId    String
  listingId String
  createdAt DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  listing Listing @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@unique([userId, listingId])
  @@index([listingId])
}
```

Note: every `@relation` must have both sides defined. The schema above is complete, but Step 3's `prisma validate` is the authority — if it reports a missing opposite relation, add the named back-relation field and re-run.

- [ ] **Step 2: Note on the dropped `Session` model**

We intentionally omit the Auth.js `Session` model (JWT strategy never uses it). If a later task surfaces a `@auth/prisma-adapter` TypeScript error referencing `session`, add this minimal model back and re-run generate:
```prisma
model Session {
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([sessionToken])
  @@index([userId])
}
```
(and add `sessions Session[]` to `User`). Do not add it preemptively.

- [ ] **Step 3: Validate and generate the client**

Run:
```bash
npx prisma validate
npm run db:generate
```
Expected: `The schema at prisma\schema.prisma is valid` and `Generated Prisma Client`. If validation reports a missing opposite relation (e.g. `Listing.bundleItems`), add the missing back-relation field and re-run.

- [ ] **Step 4: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds (nothing imports `HealthCheck`; `src/lib/db.ts` is model-agnostic).

- [ ] **Step 5: Commit**

Run:
```bash
git add prisma/schema.prisma
git commit -m "Add full TinyKloset data model (replaces HealthCheck placeholder)"
```

---

## Task 6: Create and apply the initial migration to Supabase

**Files:**
- Create: `prisma/migrations/<timestamp>_init/migration.sql` (generated)

- [ ] **Step 1: Confirm the migration target**

Run: `node -e "const u=process.env; require('dotenv').config?.(); console.log('DIRECT_URL host:', (process.env.DIRECT_URL||'').replace(/:.*@/, ':***@'))"` — or simply open `.env` and confirm `DIRECT_URL` points at the intended Supabase project (`kmtbgaayccnqgzjiqspc...supabase.com`). This step applies a real schema to a live database; verify before proceeding.

- [ ] **Step 2: Create and apply the migration**

Run: `npx prisma migrate dev --name init`
Expected: Prisma creates `prisma/migrations/<ts>_init/migration.sql`, applies it to Supabase, and reports `Your database is now in sync with your schema`.

**Fallback:** if the database is unreachable (network/credentials), run `npx prisma migrate dev --name init --create-only` to generate the SQL without applying, then report that the apply step is pending. Do not block later tasks.

- [ ] **Step 3: Sanity-check the generated SQL**

Run: `npx prisma migrate status`
Expected: reports the `init` migration as applied (or pending, if `--create-only` was used).

- [ ] **Step 4: Commit**

Run:
```bash
git add prisma/migrations
git commit -m "Add initial database migration"
```

---

## Task 7: Auth.js configuration, types, and route handler

This is the critical integration checkpoint. Read `node_modules/next/dist/docs/01-app/02-guides/authentication.md` first.

**Files:**
- Create: `src/types/next-auth.d.ts`
- Create: `src/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Add session/JWT type augmentation**

Create `src/types/next-auth.d.ts`:
```ts
import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
```

- [ ] **Step 2: Create the Auth.js config**

Create `src/auth.ts`. Note the providers read the project's existing env var names (`GOOGLE_CLIENT_ID`, etc.), and Apple is only registered when its env is present so it stays inert:
```ts
import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validation/auth";

const providers: Provider[] = [
  Credentials({
    credentials: { email: {}, password: {} },
    authorize: async (raw) => {
      const parsed = loginSchema.safeParse(raw);
      if (!parsed.success) return null;
      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return null;

      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) return null;

      return { id: user.id, email: user.email, name: user.name, role: user.role };
    },
  }),
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }),
];

// Apple stays inert until real credentials exist (deferred per spec).
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
  providers.push(
    Apple({
      clientId: process.env.APPLE_CLIENT_ID,
      clientSecret: process.env.APPLE_CLIENT_SECRET,
    }),
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
});
```

- [ ] **Step 3: Create the route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 4: Verify the build (critical integration check)**

Run: `npm run build`
Expected: build succeeds. This proves `next-auth@beta` + the Prisma adapter compile under Next 16.

**If the build fails** due to the Prisma adapter requiring a `Session` model, apply the Task 5 Step 2 fallback (add the minimal `Session` model, re-run `npm run db:generate`, and create a follow-up migration with `npx prisma migrate dev --name add-session`), then re-run the build. If it fails for an edge/runtime reason, report BLOCKED with the error — do not guess.

- [ ] **Step 5: Commit**

Run:
```bash
git add src/auth.ts src/types/next-auth.d.ts "src/app/api/auth/[...nextauth]/route.ts"
git commit -m "Wire Auth.js v5 (JWT, Credentials + Google, Apple inert)"
```

---

## Task 8: Data Access Layer (secure authorization)

**Files:**
- Create: `src/lib/dal.ts`

- [ ] **Step 1: Implement the DAL**

Create `src/lib/dal.ts`. It composes the pure helpers from `authz.ts` with the real session and database:
```ts
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/authz";
import type { Role } from "@/generated/prisma/client";

type SessionInfo = { userId: string; role: Role };

/** Returns the session or redirects to /login. Memoized per request. */
export const verifySession = cache(async (): Promise<SessionInfo> => {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return { userId: session.user.id, role: session.user.role };
});

/** Returns the current user's safe fields, or null. */
export const getCurrentUser = cache(async () => {
  const { userId } = await verifySession();
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, image: true, role: true },
  });
});

/** Asserts the current user is an admin; redirects home otherwise. */
export async function requireAdmin(): Promise<SessionInfo> {
  const session = await verifySession();
  if (!isAdmin(session.role)) {
    redirect("/");
  }
  return session;
}

/** Asserts the current user owns a storefront (is a seller). */
export async function requireSeller(): Promise<{ userId: string; storefrontId: string }> {
  const { userId } = await verifySession();
  const storefront = await prisma.storefront.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!storefront) {
    redirect("/sell/start");
  }
  return { userId, storefrontId: storefront.id };
}
```

- [ ] **Step 2: Verify it type-checks via build**

Run: `npm run build`
Expected: build succeeds. (The DAL is exercised by pages in Task 10; its pure logic is already covered by `authz.test.ts`.)

- [ ] **Step 3: Commit**

Run:
```bash
git add src/lib/dal.ts
git commit -m "Add Data Access Layer for secure authorization"
```

---

## Task 9: Proxy optimistic route protection

Read `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` first. `proxy.ts` is Next 16's renamed middleware (Node.js runtime). Use Auth.js's `auth` wrapper for optimistic JWT checks only — no database calls.

**Files:**
- Create: `proxy.ts` (repo root)

- [ ] **Step 1: Implement the proxy**

Create `proxy.ts` at the repository root:
```ts
import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/account", "/admin", "/sell"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Unauthenticated users hitting a protected route -> login.
  if (isProtected && !isLoggedIn) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // Non-admins hitting the admin area -> home (optimistic; DAL re-checks).
  if ((pathname === "/admin" || pathname.startsWith("/admin/")) && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$|favicon.ico).*)"],
};
```

- [ ] **Step 2: Verify the build picks up the proxy**

Run: `npm run build`
Expected: build succeeds and the output lists a Proxy/Middleware entry. If the build errors that `auth` cannot be used here, fall back to reading the JWT directly with `getToken` from `next-auth/jwt` inside a plain `proxy(req)` function, and record why in the commit message.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`, then in a browser:
- Visit `http://localhost:3000/account` while logged out → expect redirect to `/login?callbackUrl=/account`.
- (Full login is exercised in Task 10; if Task 10 is not yet done, this redirect alone confirms the proxy works.)
Stop the dev server when done.

- [ ] **Step 4: Commit**

Run:
```bash
git add proxy.ts
git commit -m "Add proxy.ts optimistic route protection"
```

---

## Task 10: Minimal auth UI (signup, login, logout, protected pages)

Provides a working end-to-end auth flow. Forms use react-hook-form + zod on the client; submission goes through server actions.

**Files:**
- Create: `src/app/actions/auth.ts`
- Create: `src/components/auth/SignupForm.tsx`
- Create: `src/components/auth/LoginForm.tsx`
- Create: `src/app/(auth)/signup/page.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/account/page.tsx`
- Create: `src/app/admin/page.tsx`

- [ ] **Step 1: Server actions**

Create `src/app/actions/auth.ts`:
```ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { signIn, signOut } from "@/auth";
import { signupSchema, loginSchema } from "@/lib/validation/auth";

export type ActionResult = { error: string } | undefined;

export async function signupAction(raw: unknown): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Please check your details and try again." };
  }
  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({ data: { name, email, passwordHash } });

  await signIn("credentials", { email, password, redirectTo: "/account" });
}

export async function loginAction(raw: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Invalid email or password." };
  }
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/account",
    });
  } catch (error) {
    // next-auth throws a redirect on success; re-throw those.
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    return { error: "Invalid email or password." };
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
```
Note: Auth.js `signIn` throws a special redirect error on success. The check above lets it propagate. If `signIn` is configured to not throw, the surrounding logic still returns the generic error only on real failures.

- [ ] **Step 2: Signup form (client, RHF + zod)**

Create `src/components/auth/SignupForm.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { signupAction } from "@/app/actions/auth";

export function SignupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  function onSubmit(values: SignupInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await signupAction(values);
      if (result?.error) setServerError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <input {...register("name")} placeholder="Name" className="border p-2 rounded" />
      {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}

      <input {...register("email")} placeholder="Email" className="border p-2 rounded" />
      {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}

      <input
        {...register("password")}
        type="password"
        placeholder="Password"
        className="border p-2 rounded"
      />
      {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      <button disabled={pending} className="bg-pink-600 text-white p-2 rounded">
        {pending ? "Creating account…" : "Sign up"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Login form (client, RHF + zod)**

Create `src/components/auth/LoginForm.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { loginAction } from "@/app/actions/auth";

export function LoginForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  function onSubmit(values: LoginInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await loginAction(values);
      if (result?.error) setServerError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
      <input {...register("email")} placeholder="Email" className="border p-2 rounded" />
      {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}

      <input
        {...register("password")}
        type="password"
        placeholder="Password"
        className="border p-2 rounded"
      />
      {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      <button disabled={pending} className="bg-pink-600 text-white p-2 rounded">
        {pending ? "Signing in…" : "Log in"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Auth pages**

Create `src/app/(auth)/signup/page.tsx`:
```tsx
import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-2xl font-semibold">Create your account</h1>
      <SignupForm />
    </main>
  );
}
```

Create `src/app/(auth)/login/page.tsx`:
```tsx
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-2xl font-semibold">Welcome back</h1>
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 5: Protected account page (demonstrates the DAL)**

Create `src/app/account/page.tsx`:
```tsx
import { getCurrentUser } from "@/lib/dal";
import { logoutAction } from "@/app/actions/auth";

export default async function AccountPage() {
  const user = await getCurrentUser(); // redirects to /login if unauthenticated

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-2 text-2xl font-semibold">Your account</h1>
      <p className="text-zinc-600">Signed in as {user?.email}</p>
      <p className="text-zinc-600">Role: {user?.role}</p>
      <form action={logoutAction} className="mt-4">
        <button className="rounded bg-zinc-900 p-2 text-white">Log out</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Admin-only page (demonstrates requireAdmin)**

Create `src/app/admin/page.tsx`:
```tsx
import { requireAdmin } from "@/lib/dal";

export default async function AdminPage() {
  await requireAdmin(); // redirects non-admins to /

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="text-zinc-600">Curation queue and platform settings land in later phases.</p>
    </main>
  );
}
```

- [ ] **Step 7: Build and run the full smoke test**

Run: `npm run build`
Expected: build succeeds with `/login`, `/signup`, `/account`, `/admin` routes listed.

Then `npm run dev` and verify in a browser:
- Sign up at `/signup` with a valid email/password → redirected to `/account` showing the email and `Role: USER`.
- Log out → back to `/`.
- Log in at `/login` with the same credentials → `/account`.
- Visit `/admin` as the USER → redirected to `/` (proxy) — and even if reached, `requireAdmin` redirects.
- Visit `/account` while logged out → redirected to `/login`.
Stop the dev server when done.

- [ ] **Step 8: Commit**

Run:
```bash
git add "src/app/(auth)" src/app/account src/app/admin src/app/actions src/components/auth
git commit -m "Add minimal auth UI: signup, login, logout, protected pages"
```

---

## Task 11: Documentation and final verification

**Files:**
- Modify: `.env.example` (only if new vars were introduced — none are expected)
- Modify: `README.md`

- [ ] **Step 1: Confirm env vars are documented**

Review `.env.example`. All auth vars used (`AUTH_SECRET`, `AUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, `APPLE_*`) are already present from Phase 1. No new vars are expected. If any new var was added during implementation, document it here with a comment.

- [ ] **Step 2: Update the README status**

In `README.md`, update the status line and roadmap to mark Phase 2 complete (change the `> **Status: Phase 1 (scaffold).**` note and tick item 2 in the roadmap). Keep edits minimal and factual.

- [ ] **Step 3: Full verification**

Run:
```bash
npm run lint
npm test
npm run build
```
Expected: all three pass.

- [ ] **Step 4: Commit**

Run:
```bash
git add README.md .env.example
git commit -m "Document Phase 2 completion"
```

---

## Self-Review

**Spec coverage:**
- Auth stack / versions / JWT / providers / bcryptjs / single-config → Tasks 1, 7.
- Authorization model (capability roles, proxy + DAL) → Tasks 3, 8, 9.
- Full data model (identity, catalog, commerce, social) → Task 5.
- Migration applied to Supabase → Task 6.
- Zod validation + RHF + minimal UI → Tasks 4, 10.
- Vitest + tests (password, authz, zod) → Tasks 1–4.
- Apple inert when unset → Task 7.
- Acceptance criteria (lint/test/build, auth flow, proxy+DAL) → Tasks 9, 10, 11.

**Placeholder scan:** No "TBD/TODO/handle edge cases" steps; every code step shows full code; every command shows expected output.

**Type consistency:** `Role` is a `"USER" | "ADMIN"` union in `authz.ts` and the Prisma `Role` enum (Task 5) — they match; `dal.ts` and `next-auth.d.ts` import the Prisma `Role`. `signupSchema`/`loginSchema` names are consistent across Tasks 4, 7, 10. `verifySession`/`getCurrentUser`/`requireAdmin`/`requireSeller` names are consistent across Tasks 8, 10. `signupAction`/`loginAction`/`logoutAction` consistent across Task 10.

**Known watch-items carried into execution:** (1) dropped `Session` model may need re-adding if the adapter demands it (Task 5 Step 2 / Task 7 Step 4); (2) `proxy.ts` + `auth` wrapper verified by build with a documented fallback (Task 9 Step 2).
```
