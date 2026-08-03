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

/**
 * Adds a trading account.
 *
 * The slot is derived server-side from the highest in use rather than sent by
 * the client: two tabs adding at once would otherwise pick the same number and
 * collide on the `(userId, slot)` unique key.
 */
export async function createTradingAccount(): Promise<{ id: string }> {
  const userId = await requireUserIdOrThrow();

  const last = await prisma.tradingAccount.findFirst({
    where: { userId },
    orderBy: { slot: "desc" },
    select: { slot: true },
  });

  const slot = (last?.slot ?? 0) + 1;

  // Colours cycle through the palette so a new account is distinguishable at a
  // glance without asking the user to pick one before they have named it.
  const palette = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"];

  const account = await prisma.tradingAccount.create({
    data: {
      userId,
      slot,
      name: `Compte ${slot}`,
      initialCapital: 5000,
      currentCapital: 5000,
      tradingCapital: 5000,
      useRealCapital: true,
      maxDDPct: 8,
      targetPct: 8,
      riskPct: 0.4,
      style: AccountStyle.SCALPING,
      color: palette[(slot - 1) % palette.length]!,
      allowedEntries: [
        EntryType.M2_ENTRY,
        EntryType.A12_ENTRY,
        EntryType.A2_ENTRY,
        EntryType.A21_ENTRY,
        EntryType.A22_ENTRY,
        EntryType.GOLDEN_ENTRY,
      ],
    },
    select: { id: true },
  });

  revalidatePath("/comptes");
  return { id: account.id };
}

/**
 * Deletes a trading account.
 *
 * Trades keep their history: `Trade.accountId` is nullable and set to null on
 * delete, so removing an account does not erase the record of what was traded
 * on it. Losing months of journal because an account was closed would be the
 * worst possible reading of "delete".
 */
export async function deleteTradingAccount(accountId: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const id = z.string().min(1).parse(accountId);

  await prisma.tradingAccount.deleteMany({ where: { id, userId } });
  revalidatePath("/comptes");
}
