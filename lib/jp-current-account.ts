import "server-only";

import { periodEnd } from "@/domain/macro/period";
import { fetchBojCurrentAccountData } from "@/lib/integrations/boj";
import { contextKeyToDb } from "@/lib/currencies";
import { prisma } from "@/lib/prisma";
import { IndicatorSource } from "@/lib/generated/prisma/enums";

/**
 * Feeds MarketContext's `jpCurrentAccount` — what `jp_balance` and its card
 * display both prefer over the plain trade balance (see
 * domain/scoring/indicator-display.ts and domain/market-context/scorers.ts).
 * The field had NO source at all before this: it stayed permanently null, so
 * the JPY balance card always fell back to the generic trade balance and
 * `needsManualCheck` flagged it as unconnected — same "TWO WRITES" shape as
 * lib/dairy.ts, except only the MarketContextValue side applies here, since
 * the trade-balance HALF of this data already gets its own chartable
 * IndicatorValue history through the BoJ block in macro-refresh.ts.
 */

const KEY = "jpCurrentAccount";

export interface JpCurrentAccountRefreshReport {
  written: boolean;
  value: number | null;
  period: string | null;
  error: string | null;
}

export async function refreshJpCurrentAccount(userId: string): Promise<JpCurrentAccountRefreshReport> {
  const result = await fetchBojCurrentAccountData();
  if (result.error || result.history.length === 0) {
    return { written: false, value: null, period: null, error: result.error ?? "aucune donnée" };
  }

  const latest = result.history[result.history.length - 1]!;
  const observedOn = periodEnd(latest.period);
  if (!observedOn) {
    return { written: false, value: null, period: null, error: "période BoJ illisible" };
  }

  const dbKey = contextKeyToDb(KEY);
  await prisma.marketContextValue.upsert({
    where: { userId_key_observedOn: { userId, key: dbKey, observedOn } },
    create: { userId, key: dbKey, value: latest.value, observedOn, source: IndicatorSource.BOJ },
    update: { value: latest.value, source: IndicatorSource.BOJ },
  });

  return { written: true, value: latest.value, period: latest.period, error: null };
}
