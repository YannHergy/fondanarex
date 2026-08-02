import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * Deployment diagnostics.
 *
 * Netlify renders a generic "A server error occurred" page for any uncaught
 * server exception, which tells you nothing about the cause. This endpoint
 * answers the two questions that actually matter — is the configuration
 * present, and can the database be reached — without needing log access.
 *
 * It reports only booleans and error text, never a connection string. Values
 * are redacted before they leave the process.
 */

export const dynamic = "force-dynamic";

/**
 * Strips anything credential-shaped from a driver error before returning it.
 * Postgres errors routinely echo the DSN back, which would publish the password
 * on an endpoint that currently has no authentication in front of it.
 */
function redact(message: string): string {
  return message
    .replace(/postgres(ql)?:\/\/[^\s"']+/gi, "postgresql://[redacted]")
    .replace(/(password=)[^\s&"']+/gi, "$1[redacted]")
    .slice(0, 500);
}

function present(name: string): boolean {
  return (process.env[name] ?? "").length > 0;
}

/**
 * Renders a thrown value as readable text.
 *
 * Not simply `String(error)`: the Neon driver and Prisma both throw values that
 * are not Error instances, and stringifying those yields "[object Object]" —
 * which is exactly the uninformative output this endpoint exists to avoid. The
 * useful detail is usually nested in `cause` (a socket error) or in the
 * `errors` array of an AggregateError.
 */
function describe(error: unknown, depth = 0): string {
  if (depth > 3) return "";
  if (error === null || error === undefined) return "";
  if (typeof error === "string") return error;

  if (error instanceof AggregateError) {
    const parts = error.errors.map((e) => describe(e, depth + 1)).filter(Boolean);
    return [error.message, ...parts].filter(Boolean).join(" | ");
  }

  if (error instanceof Error) {
    const parts = [error.name === "Error" ? "" : error.name, error.message].filter(Boolean);
    const cause = describe(error.cause, depth + 1);
    if (cause) parts.push(`caused by: ${cause}`);
    return parts.join(": ");
  }

  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    // Common shapes from pg / Neon: { message, code, errno, syscall, address }.
    const named = ["message", "code", "errno", "syscall", "address", "port"]
      .filter((k) => record[k] !== undefined)
      .map((k) => `${k}=${String(record[k])}`);
    if (named.length > 0) return named.join(" ");

    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }

  return String(error);
}

export async function GET() {
  const config = {
    DATABASE_URL: present("DATABASE_URL"),
    DIRECT_URL: present("DIRECT_URL"),
  };

  const integrations = {
    FRED_API_KEY: present("FRED_API_KEY"),
    FINNHUB_API_KEY: present("FINNHUB_API_KEY"),
    MARKETAUX_API_KEY: present("MARKETAUX_API_KEY"),
    NEWS_API_KEY: present("NEWS_API_KEY"),
    FXMACRODATA_API_KEY: present("FXMACRODATA_API_KEY"),
    ANTHROPIC_API_KEY: present("ANTHROPIC_API_KEY"),
    GROQ_API_KEY: present("GROQ_API_KEY"),
    PERPLEXITY_API_KEY: present("PERPLEXITY_API_KEY"),
    METAAPI_TOKEN: present("METAAPI_TOKEN"),
  };

  let database: { ok: boolean; detail: string; currencies?: number };

  if (!config.DATABASE_URL) {
    database = {
      ok: false,
      detail:
        "DATABASE_URL is not set. Add the Neon POOLED connection string in Netlify -> Site settings -> Environment variables, then redeploy.",
    };
  } else {
    try {
      // A real query, not just a connection: this proves the schema is migrated
      // and the reference seed has run, which is what the pages depend on.
      const currencies = await prisma.currency.count();
      database = {
        ok: true,
        currencies,
        detail:
          currencies === 8
            ? "Connected; reference data seeded."
            : `Connected, but found ${currencies} currencies (expected 8). Run \`pnpm db:seed\`.`,
      };
    } catch (error) {
      database = {
        ok: false,
        detail: redact(describe(error)) || "Unknown database error.",
      };
    }
  }

  return NextResponse.json(
    {
      ok: database.ok,
      runtime: { node: process.version, env: process.env.NODE_ENV },
      config,
      database,
      integrations,
    },
    { status: database.ok ? 200 : 503 },
  );
}
