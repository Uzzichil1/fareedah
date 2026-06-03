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
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
