"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ALL_ENTRY_TYPES } from "@/domain/data/entry-types";
import { prisma } from "@/lib/prisma";
import { requireUserIdOrThrow } from "@/lib/session";
import { AccountStyle, EntryType } from "@/lib/generated/prisma/enums";

const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(64),
  initialCapital: z.number().finite().positive().max(1_000_000_000),
  currentCapital: z.number().finite().min(0).max(1_000_000_000),
  tradingCapital: z.number().finite().positive().max(1_000_000_000),
  useRealCapital: z.boolean(),
  riskPct: z.number().finite().min(0).max(100),
  maxDDPct: z.number().finite().min(0).max(100),
  targetPct: z.number().finite().min(0).max(1000).nullable(),
  style: z.enum(["SCALPING", "DAY_SWING"]),
  allowedEntries: z.array(z.enum(ALL_ENTRY_TYPES as unknown as [string, ...string[]])),
  isActive: z.boolean(),
});

export async function saveTradingAccount(input: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const parsed = accountSchema.parse(input);

  // updateMany scopes by userId as well as id, so a guessed identifier cannot
  // reach another user's account.
  await prisma.tradingAccount.updateMany({
    where: { id: parsed.id, userId },
    data: {
      name: parsed.name,
      initialCapital: parsed.initialCapital,
      currentCapital: parsed.currentCapital,
      tradingCapital: parsed.tradingCapital,
      useRealCapital: parsed.useRealCapital,
      riskPct: parsed.riskPct,
      maxDDPct: parsed.maxDDPct,
      targetPct: parsed.targetPct,
      style: parsed.style as AccountStyle,
      allowedEntries: parsed.allowedEntries as EntryType[],
      isActive: parsed.isActive,
    },
  });

  revalidatePath("/", "layout");
}

/**
 * Adjusts the live capital of an account.
 *
 * Separate from the full save because it is the frequent operation — logging a
 * day's result — and should not require opening the whole configuration form.
 */
export async function adjustAccountCapital(input: unknown): Promise<{ capital: number }> {
  const userId = await requireUserIdOrThrow();
  const { id, delta } = z
    .object({ id: z.string().min(1), delta: z.number().finite() })
    .parse(input);

  const account = await prisma.tradingAccount.findFirst({
    where: { id, userId },
    select: { currentCapital: true },
  });
  if (!account) throw new Error("Compte introuvable");

  const next = Math.max(0, Number(account.currentCapital) + delta);

  await prisma.tradingAccount.updateMany({
    where: { id, userId },
    data: { currentCapital: next },
  });

  revalidatePath("/", "layout");
  return { capital: next };
}
