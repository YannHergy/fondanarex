import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { provisionUser } from "@/lib/bootstrap";

/**
 * AUTHENTICATION IS CURRENTLY DISABLED.
 *
 * The app runs as a single implicit user: anyone who can reach the deployment
 * gets the same workspace, with no sign-in. This is a deliberate, temporary
 * state so the project can be deployed while GitHub OAuth credentials are
 * pending — it is NOT safe for a public URL holding real trading data.
 *
 * Everything below is shaped so restoring auth is a change to THIS FILE ONLY.
 * Every data-access function still takes an explicit `userId`, and every page
 * still resolves it through `requireUserId()`. To re-enable:
 *
 *   1. restore `auth.ts`, `app/signin/`, `app/api/auth/[...nextauth]/` and the
 *      session check in `proxy.ts` — all present in git history;
 *   2. point `currentUserId()` back at the Auth.js session;
 *   3. delete `getOrCreateDefaultUser()`.
 *
 * No call site changes.
 */

/** Stable identity for the implicit single user while auth is off. */
const DEFAULT_USER_EMAIL = "owner@fondanarex.local";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/**
 * The single workspace user, created and provisioned on first use.
 *
 * Kept UNCACHED and exported to the retry loop below, because a memoised
 * promise that REJECTS stays rejected for the rest of the request. See
 * `currentUserId` — that is the whole reason this function exists separately
 * from the cached wrapper.
 */
async function resolveDefaultUser(): Promise<string> {
  // Fast path: one indexed read, which is what almost every request takes.
  //
  // This used to be an unconditional upsert followed by provisionUser(), and
  // provisionUser performs ~15 sequential upserts (settings, four trading
  // accounts, eight alert preferences, eight currency notes). That ran on EVERY
  // request, including the ones that only needed the theme for the root layout.
  // Against a serverless Postgres each of those is a network round trip, so a
  // cold start could exceed a serverless function's execution limit and fail
  // the whole page — while doing no useful work, since the rows already existed.
  const existing = await prisma.user.findUnique({
    where: { email: DEFAULT_USER_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Slow path: runs once for the lifetime of the deployment.
  const created = await prisma.user.upsert({
    where: { email: DEFAULT_USER_EMAIL },
    create: { email: DEFAULT_USER_EMAIL, name: "Fondanarex" },
    update: {},
    select: { id: true },
  });

  // Settings, trading accounts, alert preferences and baseline stances. Safe to
  // call repeatedly — every write inside is an upsert that never overwrites —
  // so a race between two cold requests is harmless.
  await provisionUser(created.id);

  return created.id;
}

/**
 * The memoised entry point: one lookup per request on the happy path.
 *
 * The upsert is idempotent, so a cold start, a concurrent request and a
 * redeploy all converge on the same row.
 */
const getOrCreateDefaultUser = cache(resolveDefaultUser);

/**
 * Caps how long a request will wait on the database before giving up.
 *
 * Without this, an unreachable or slow database makes every render hang until
 * the platform kills the function, which surfaces as an opaque platform error.
 * Failing fast lets the caller degrade to a readable page instead.
 */
class DatabaseTimeout extends Error {}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DatabaseTimeout(`Database timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The user id for the current request, or null if the database is unreachable.
 *
 * Returning null rather than throwing matters during `next build`: page data
 * collection can execute this without a live DATABASE_URL, and a throw there
 * fails the whole deployment instead of the one request that needed the data.
 */
export async function currentUserId(): Promise<string | null> {
  // Several attempts, because the first can time out on a request that is
  // otherwise healthy. Neon SUSPENDS an idle branch, and the connection that
  // wakes it pays the whole cost. Measured on this project: 220ms warm, 1.5s on
  // a light sleep — but a branch left alone for hours answers P1001 outright
  // for a while, and in development that lands on top of a page compiling for
  // the first time, which alone can take tens of seconds.
  //
  // The budget was 8s then 12s and it was not enough: the error screen came
  // back on a database that woke up perfectly two seconds later. Twenty-five
  // seconds on the last attempt is a long wait, but a slow page beats a page
  // that tells the user their database is gone when it is merely asleep.
  //
  // TWO FAILURE MODES, and they need opposite treatments.
  //
  // A TIMEOUT means the query is still running — the branch is waking. Retrying
  // must await the SAME in-flight promise, which is what the memoised wrapper
  // gives us: no second connection, no restarted wait.
  //
  // A REJECTION is the opposite. Once the memoised promise rejects, it stays
  // rejected for the rest of the request, so every later attempt awaits a
  // corpse and fails instantly. That was a real bug: an intermittent
  // `getaddrinfo ENOTFOUND` on the Neon host burned all three budgets in about
  // 150ms and showed "database unavailable" on a database that resolved fine a
  // second later. After a rejection we therefore open a FRESH call, and pause
  // first — a DNS blip needs a moment, not another instant hammer.
  let poisoned = false;

  for (const [attempt, budgetMs] of [8_000, 12_000, 25_000].entries()) {
    try {
      return await withTimeout(poisoned ? resolveDefaultUser() : getOrCreateDefaultUser(), budgetMs);
    } catch (error) {
      poisoned = !(error instanceof DatabaseTimeout);
      if (poisoned && attempt < 2) await sleep(600);
    }
  }

  return null;
}

/** For pages: resolve the user id, or throw so the error boundary renders. */
export async function requireUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Base de données indisponible : impossible de résoudre l'utilisateur.");
  return userId;
}

/** For route handlers and server actions. */
export async function requireUserIdOrThrow(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new UnauthorizedError();
  return userId;
}
