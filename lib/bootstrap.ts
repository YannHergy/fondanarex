import "server-only";

import { CURRENCY_BASELINE } from "@/domain/data/baseline";
import type { CentralBankStance } from "@/domain/types";
import { prisma } from "@/lib/prisma";
import { STANCE_TO_DB } from "@/lib/currencies";
import { AccountStyle, EntryType } from "@/lib/generated/prisma/enums";

/**
 * Rows every user needs before the app is usable.
 *
 * In the legacy app the four trading accounts were a hardcoded `ACCOUNT_CONFIGS`
 * array in the source. They are plainly user data — specific prop-firm accounts
 * with personal capital, drawdown limits and permitted setups — so they are rows
 * here and editable without a deploy. The values below are the legacy defaults,
 * used only as the starting point for a brand new user.
 */
const DEFAULT_ACCOUNTS = [
  {
    slot: 1,
    name: "Compte 1",
    initialCapital: 5000,
    tradingCapital: 5000,
    useRealCapital: true,
    maxDDPct: 8,
    targetPct: 8,
    riskPct: 0.4,
    style: AccountStyle.SCALPING,
    color: "#8b5cf6",
    allowedEntries: [
      EntryType.M2_ENTRY,
      EntryType.A12_ENTRY,
      EntryType.A2_ENTRY,
      EntryType.A21_ENTRY,
      EntryType.A22_ENTRY,
      EntryType.GOLDEN_ENTRY,
    ],
  },
  {
    slot: 2,
    name: "Compte 2",
    initialCapital: 25000,
    tradingCapital: 25000,
    useRealCapital: true,
    maxDDPct: 8,
    targetPct: 8,
    riskPct: 0.4,
    style: AccountStyle.DAY_SWING,
    color: "#3b82f6",
    allowedEntries: [
      EntryType.A2_ENTRY,
      EntryType.A21_ENTRY,
      EntryType.A22_ENTRY,
      EntryType.GOLDEN_ENTRY,
    ],
  },
] as const;

/**
 * Idempotent. Safe to call on every sign-in, not just at user creation, so a
 * user created before a later addition still gets it.
 */
export async function provisionUser(userId: string): Promise<void> {
  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  for (const account of DEFAULT_ACCOUNTS) {
    const { slot, ...rest } = account;
    await prisma.tradingAccount.upsert({
      where: { userId_slot: { userId, slot } },
      create: {
        userId,
        slot,
        ...rest,
        currentCapital: account.initialCapital,
        allowedEntries: [...account.allowedEntries],
      },
      // Never overwrite live values — the user edits capital and limits.
      update: {},
    });
  }

  const currencies = await prisma.currency.findMany({ select: { code: true } });
  for (const { code } of currencies) {
    await prisma.alertPreference.upsert({
      where: { userId_currencyCode: { userId, currencyCode: code } },
      create: { userId, currencyCode: code },
      update: {},
    });
  }

  // Central bank stance is a judgement call, not a published statistic, so it is
  // per-user data in CurrencyNote rather than a shared IndicatorValue. New users
  // start from the stances the legacy app shipped with.
  for (const baseline of CURRENCY_BASELINE) {
    const stance = STANCE_TO_DB[baseline.stance as CentralBankStance];
    if (!stance) continue;

    await prisma.currencyNote.upsert({
      where: { userId_currencyCode: { userId, currencyCode: baseline.code } },
      create: { userId, currencyCode: baseline.code, stance },
      update: {},
    });
  }
}
