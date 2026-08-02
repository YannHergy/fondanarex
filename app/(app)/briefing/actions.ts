"use server";

import { revalidatePath } from "next/cache";

import { runBriefing, type BriefingProgress } from "@/lib/briefing";
import { requireUserIdOrThrow } from "@/lib/session";

/**
 * Starts a briefing.
 *
 * A full run is 20 model calls and takes minutes. It is deliberately awaited
 * rather than fire-and-forget so the caller learns whether it succeeded — each
 * round is persisted as it completes, so a timeout still leaves a readable
 * partial session behind.
 */
export async function startBriefing(): Promise<BriefingProgress> {
  const userId = await requireUserIdOrThrow();
  const result = await runBriefing(userId);

  revalidatePath("/briefing");
  return result;
}
