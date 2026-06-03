import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 configuration. Migrations connect directly (port 5432) via
// DIRECT_URL; the app's runtime connection (pooled, 6543) is configured on the
// driver adapter in src/lib/db.ts instead.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
