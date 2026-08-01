import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Prisma 7 no longer reads the connection URL from schema.prisma — the client is
 * constructed with a driver adapter instead. For Neon we use the serverless
 * driver so connections work from serverless runtimes without exhausting
 * Postgres connections.
 *
 * The runtime uses the POOLED url (`-pooler` host). Migrations use DIRECT_URL
 * and are configured separately in prisma.config.ts.
 */

// The Neon serverless driver needs a WebSocket implementation under Node.
neonConfig.webSocketConstructor = ws;

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env locally, or to the environment variables of your deployment.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getClient(): PrismaClient {
  // Reused across hot reloads in development; without this every edit opens a
  // new pool and Neon starts refusing connections.
  const existing = globalForPrisma.prisma;
  if (existing) return existing;

  const client = createClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

/**
 * Lazily-constructed Prisma client.
 *
 * Construction is deferred to first property access rather than happening at
 * module load. `next build` imports every module that a page transitively
 * references, so an eager client would make the BUILD require a live
 * DATABASE_URL — turning a missing variable into a failed deployment instead of
 * a failed request. This keeps the failure where it belongs.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getClient(), property, receiver);
  },
  has(_target, property) {
    return Reflect.has(getClient(), property);
  },
});
