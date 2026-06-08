// proc.ts — runs `scripts/e2e-db.ts` commands in a child `tsx` process.
//
// Deliberately imports NOTHING from `src/lib/db` (or anything that touches
// the generated Prisma client): Playwright transforms this file through
// Babel-to-CJS, and Prisma 7's generated client is ESM-only
// (`import.meta.url` at module scope), which crashes under that transform.
// See the architecture note at the top of `scripts/e2e-db.ts` for the full
// story. This file is the ONLY place that knows how to invoke that script;
// `factories.ts` and `cleanup.ts` build on top of it.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { RESULT_MARKER } from "./constants";

const execFileAsync = promisify(execFile);

// Invoke tsx's CLI entry directly via `node` (a real, non-shell executable).
// Avoids two Windows pitfalls with `execFile`:
//   - `npx`/`npx.cmd` resolution differences across shells, and
//   - `spawn EINVAL` when execFile-ing `.cmd`/`.bat` shims without `shell: true`
//     (which in turn trips Node's "unescaped args" deprecation warning).
const TSX_CLI = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const E2E_DB_SCRIPT = path.join(process.cwd(), "scripts", "e2e-db.ts");

/**
 * Runs `scripts/e2e-db.ts <command> <jsonArgs>` in a child process and
 * returns the parsed JSON result.
 *
 * `scripts/e2e-db.ts` prints its result as the LAST stdout line, prefixed
 * with `RESULT_MARKER` — Prisma's `log: ["error", "warn"]` can also write to
 * stdout/stderr, so we scan for the marked line rather than assuming stdout
 * is JSON-only.
 */
export async function runE2EDb<T = unknown>(command: string, ...args: unknown[]): Promise<T> {
  const argsJson = JSON.stringify(args);
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(process.execPath, [TSX_CLI, E2E_DB_SCRIPT, command, argsJson], {
      cwd: process.cwd(),
      env: process.env,
    }));
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `e2e-db "${command}" failed: ${e.message ?? err}\n--- stdout ---\n${e.stdout ?? ""}\n--- stderr ---\n${e.stderr ?? ""}`
    );
  }

  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.startsWith(RESULT_MARKER));
  if (!line) {
    throw new Error(`e2e-db "${command}": no result marker found in stdout:\n${stdout}`);
  }
  return JSON.parse(line.slice(RESULT_MARKER.length)) as T;
}
