"use server";

import { revalidatePath } from "next/cache";

import { recordScoresAndAlert } from "@/lib/alerts";
import { refreshMacroData, type RefreshReport } from "@/lib/macro-refresh";
import { requireUserIdOrThrow } from "@/lib/session";

/**
 * Manual "refresh now" from the dashboard.
 *
 * The same ingestion the scheduled job runs. It exists because a user watching
 * for a release should not have to wait for the next cron tick — the legacy
 * dashboard had exactly this button, and it is the only way to pull a figure
 * the moment it publishes.
 */
export async function refreshMacroAction(): Promise<RefreshReport & { alerts: number }> {
  const userId = await requireUserIdOrThrow();
  const report = await refreshMacroData();

  // Snapshot the resulting scores and raise alerts for meaningful moves. Done
  // after ingestion so the comparison is against freshly written values, and
  // tolerated as best-effort: a failure here must not lose the data just
  // fetched.
  let alerts = 0;
  try {
    const run = await recordScoresAndAlert(userId);
    alerts = run.created;
  } catch {
    alerts = 0;
  }

  // Every screen reads these values, so the whole tree is invalidated.
  revalidatePath("/", "layout");

  return { ...report, alerts };
}
