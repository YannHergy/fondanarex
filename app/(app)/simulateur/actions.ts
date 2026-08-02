"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUserIdOrThrow } from "@/lib/session";

const settingsSchema = z.object({
  riskCapital: z.number().finite().positive().max(1_000_000_000),
  riskPct: z.number().finite().min(0).max(100),
  riskRR: z.number().finite().min(0).max(100),
});

/**
 * Persists the risk-calculator defaults.
 *
 * These lived in three separate localStorage keys in the legacy app, which
 * meant they were per-browser and silently lost when storage was cleared.
 */
export async function saveRiskDefaults(input: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const data = settingsSchema.parse(input);

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  revalidatePath("/", "layout");
}
