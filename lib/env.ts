import { z } from "zod";

/**
 * Environment validation.
 *
 * Deliberately LAZY: the schema is parsed on first access, not at module load.
 * `next build` runs with placeholder or absent secrets (see .github/workflows/ci.yml
 * and any Netlify/Vercel build that has not had its variables populated yet), and
 * an eager parse would fail the build rather than the request that actually needs
 * the value. Missing configuration should break the feature that uses it, loudly,
 * at runtime — not the whole deployment.
 */

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().min(1).optional(),

  // Optional while authentication is disabled (see lib/session.ts). Make
  // AUTH_SECRET required again when Auth.js is restored — without it, sessions
  // are unsigned.
  AUTH_SECRET: z.string().default(""),
  AUTH_GITHUB_ID: z.string().default(""),
  AUTH_GITHUB_SECRET: z.string().default(""),
  AUTH_ALLOWED_LOGINS: z.string().default(""),

  ANTHROPIC_API_KEY: z.string().default(""),
  GROQ_API_KEY: z.string().default(""),
  PERPLEXITY_API_KEY: z.string().default(""),

  FRED_API_KEY: z.string().default(""),
  FINNHUB_API_KEY: z.string().default(""),
  MARKETAUX_API_KEY: z.string().default(""),
  NEWS_API_KEY: z.string().default(""),
  FXMACRODATA_API_KEY: z.string().default(""),

  METAAPI_TOKEN: z.string().default(""),
  METAAPI_ACCOUNT_ID: z.string().default(""),

  CRON_SECRET: z.string().default(""),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Parse and cache the server environment. Throws a readable aggregate error
 * listing every missing or malformed variable at once.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server environment:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/**
 * Whether an optional integration is configured. Use this to degrade gracefully
 * — a missing FRED key should disable the FRED source and surface that in the
 * UI, not crash the dashboard.
 */
export function hasIntegration(
  key: Extract<
    keyof ServerEnv,
    | "ANTHROPIC_API_KEY"
    | "GROQ_API_KEY"
    | "PERPLEXITY_API_KEY"
    | "FRED_API_KEY"
    | "FINNHUB_API_KEY"
    | "MARKETAUX_API_KEY"
    | "NEWS_API_KEY"
    | "FXMACRODATA_API_KEY"
    | "METAAPI_TOKEN"
  >,
): boolean {
  const value = process.env[key];
  return typeof value === "string" && value.length > 0;
}
