import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 consolidates CLI configuration here. This replaces the `prisma`
 * key in package.json (used for the seed command in v6 and earlier), which is
 * no longer read.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations must run over the DIRECT (unpooled) Neon connection.
    // Running DDL through the pgBouncer pooler fails on advisory locks.
    url: env("DIRECT_URL"),
  },
});
