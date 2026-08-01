import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Prisma 7 no longer reads the connection URL from schema.prisma — the client
 * is constructed with a driver adapter instead. For Neon we use the serverless
 * driver so that connections work from serverless/edge-style runtimes without
 * exhausting Postgres connections.
 *
 * The runtime uses the POOLED url (`-pooler` host). Migrations use DIRECT_URL
 * and are configured separately in prisma.config.ts.
 */

// The Neon serverless driver needs a WebSocket implementation when running
// under Node (browsers supply one natively).
neonConfig.webSocketConstructor = ws;

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env locally, or to the environment variables of your deployment.",
    );
  }

  const adapter = new PrismaNeon({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Reuse the client across hot reloads in development. Without this, every edit
 * opens a new pool and Neon starts refusing connections.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
