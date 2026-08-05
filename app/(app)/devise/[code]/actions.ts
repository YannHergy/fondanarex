"use server";

import { revalidatePath } from "next/cache";

import { refreshNews } from "@/lib/news";
import { requireUserIdOrThrow } from "@/lib/session";

/**
 * Forces a news refresh, ignoring the staleness threshold.
 *
 * The threshold exists so browsing feels live without hammering a free feed.
 * This is the escape hatch for the half hour before a payrolls release, when
 * thirty minutes of latency is thirty minutes too many.
 */
export async function forceRefreshNews(): Promise<
  { ok: true; stored: number } | { ok: false; error: string }
> {
  await requireUserIdOrThrow();

  try {
    const summary = await refreshNews();
    revalidatePath("/devise/[code]", "page");
    return { ok: true, stored: summary.stored };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Rafraîchissement impossible",
    };
  }
}
