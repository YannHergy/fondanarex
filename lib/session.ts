import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { provisionUser } from "@/lib/bootstrap";

/**
 * ⚠️  AUTHENTICATION IS CURRENTLY DISABLED.
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
 * `cache` keeps this to one lookup per request. The upsert is idempotent, so a
 * cold start, a concurrent request and a redeploy all converge on the same row.
 */
const getOrCreateDefaultUser = cache(async (): Promise<string> => {
  const user = await prisma.user.upsert({
    where: { email: DEFAULT_USER_EMAIL },
    create: { email: DEFAULT_USER_EMAIL, name: "Fondanarex" },
    update: {},
    select: { id: true },
  });

  // Settings, trading accounts, alert preferences and baseline stances. Safe to
  // call repeatedly — every write inside is an upsert that never overwrites.
  await provisionUser(user.id);

  return user.id;
});

/**
 * The user id for the current request, or null if the database is unreachable.
 *
 * Returning null rather than throwing matters during `next build`: page data
 * collection can execute this without a live DATABASE_URL, and a throw there
 * fails the whole deployment instead of the one request that needed the data.
 */
export async function currentUserId(): Promise<string | null> {
  try {
    return await getOrCreateDefaultUser();
  } catch {
    return null;
  }
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
