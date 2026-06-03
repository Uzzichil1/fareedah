import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Single PrismaClient instance, reused across hot-reloads in development.
// Without this guard, Next.js's dev server spins up a new client on every
// reload and exhausts the database connection pool.
//
// Prisma 7 connects through a driver adapter: the pooled DATABASE_URL
// (PgBouncer, port 6543) is passed to the pg adapter here. Migrations use
// DIRECT_URL via prisma.config.ts instead.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  // TLS is enabled but the chain is not verified: Supabase's pooler presents a
  // self-signed cert, so `sslmode=verify-full` (pg's modern default for
  // `require`) rejects it. `rejectUnauthorized: false` keeps the connection
  // encrypted. To fully verify in production, supply Supabase's CA via
  // `ssl: { ca }` instead.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
