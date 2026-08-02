"use server";

import { revalidatePath } from "next/cache";

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
export async function refreshMacroAction(): Promise<RefreshReport> {
  await requireUserIdOrThrow();
  const report = await refreshMacroData();

  // Every screen reads these values, so the whole tree is invalidated.
  revalidatePath("/", "layout");

  return report;
}
