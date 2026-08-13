import "server-only";

import { cache } from "react";

import type { AccountConfig } from "@/domain/accounts/metrics";
import type { EntryType } from "@/domain/data/entry-types";
import { prisma } from "@/lib/prisma";

/**
 * Trading accounts.
 *
 * In the legacy app the four accounts were a hardcoded `ACCOUNT_CONFIGS` array
 * in the source, with only `currentCapital` mutable in localStorage. They are
 * plainly user data — specific prop-firm accounts with personal capital,
 * drawdown limits and permitted setups — so they are rows here, editable
 * without a deploy.
 */

export interface TradingAccountRow extends AccountConfig {
  id: string;
  slot: number;
  name: string;
  color: string;
  style: "SCALPING" | "DAY_SWING";
  isActive: boolean;
  /** Trades recorded against this account, so a delete can say what survives. */
  tradeCount: number;
  /** Setups autorisés, aux noms du trader. Remplace allowedEntries. */
  allowedSetups: string[];
  /** Seuil d'alerte choisi, en % du capital initial. Null = aucune alerte. */
  alertThresholdPct: number | null;
}

export const getTradingAccounts = cache(
  async (userId: string): Promise<TradingAccountRow[]> => {
    const accounts = await prisma.tradingAccount.findMany({
      where: { userId },
      orderBy: { slot: "asc" },
      include: { _count: { select: { trades: true } } },
    });

    return accounts.map((account) => ({
      id: account.id,
      slot: account.slot,
      name: account.name,
      color: account.color,
      tradeCount: account._count.trades,
      style: account.style as TradingAccountRow["style"],
      isActive: account.isActive,
      initialCapital: Number(account.initialCapital),
      currentCapital: Number(account.currentCapital),
      tradingCapital: Number(account.tradingCapital),
      useRealCapital: account.useRealCapital,
      riskPct: Number(account.riskPct),
      maxDDPct: Number(account.maxDDPct),
      targetPct: account.targetPct === null ? null : Number(account.targetPct),
      allowedEntries: account.allowedEntries as EntryType[],
      allowedSetups: account.allowedSetups,
      alertThresholdPct:
        account.alertThresholdPct === null ? null : Number(account.alertThresholdPct),
    }));
  },
);
