import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/**
 * The user id for the current request, or null.
 *
 * Every data-access function in this app takes an explicit userId rather than
 * reaching for the session itself. That keeps the ownership boundary visible in
 * each function signature and lets the data layer be tested without a request
 * context.
 */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** For pages: resolve the user id or redirect to sign-in. */
export async function requireUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) redirect("/signin");
  return userId;
}

/** For route handlers and server actions: resolve the user id or throw. */
export async function requireUserIdOrThrow(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new UnauthorizedError();
  return userId;
}
