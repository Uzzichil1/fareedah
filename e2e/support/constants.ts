// constants.ts — plain shared literals for the E2E data-isolation layer.
//
// IMPORTANT: this file must import NOTHING (no `src/lib/db`, no Prisma, no
// ESM-only module) — only `export const` literals. It is imported by
// `proc.ts` / `factories.ts`, which Playwright transforms through Babel to
// CommonJS; pulling in the ESM-only Prisma client here would reintroduce the
// exact "exports is not defined in ES module scope" crash the subprocess
// architecture exists to avoid (see the note atop `scripts/e2e-db.ts`).
//
// Both constants are genuinely shared across the reader/writer boundary, so
// they live here as the single source of truth rather than being duplicated
// and kept in sync by comment.

/** Shared fixture password — satisfies the signup/login zod rule (min 8
 *  chars, ≥1 letter, ≥1 number, ≥1 special char; 9 chars).
 *
 *  Written (as a bcrypt hash) by `createUser` in `scripts/e2e-db.ts` and used
 *  as plaintext by `signIn` (`e2e/support/auth.ts`). Sharing the literal means
 *  the hash and the login plaintext can never drift — drift would surface as
 *  an opaque `/login` redirect timeout, not a clear assertion failure. */
export const E2E_PASSWORD = "E2eTest!1";

/** Marks the single JSON result line that `scripts/e2e-db.ts` (writer) prints
 *  and `proc.ts` (reader) scans for. Prisma's `log: ["error","warn"]` can also
 *  write to stdout/stderr, so the marker makes the "last JSON line" contract
 *  explicit on both sides. */
export const RESULT_MARKER = "__E2E_DB_RESULT__";
