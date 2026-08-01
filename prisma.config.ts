import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 consolidates CLI configuration here. This replaces the `prisma`
 * key in package.json (used for the seed command in v6 and earlier), which is
 * no longer read.
 */

/**
 * Migrations must run over the DIRECT (unpooled) Neon connection — DDL through
 * the pgBouncer pooler fails on advisory locks.
 *
 * Resolved with a plain lookup and a placeholder fallback rather than Prisma's
 * `env()` helper, which THROWS when the variable is missing. That throw broke
 * `prisma generate`, and generate is the first command in the Netlify build:
 * it only reads schema.prisma and writes the client, so it never connects and
 * has no business requiring a database URL. A deploy that has not had its
 * environment variables filled in yet should fail at the request that needs the
 * database, not at code generation.
 *
 * Commands that DO connect — `migrate`, `db push`, `studio`, `db seed` — still
 * get the real URL, and fail loudly against the placeholder if it is absent.
 */
const migrationUrl =
  process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://unset-direct-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl,
  },
});
