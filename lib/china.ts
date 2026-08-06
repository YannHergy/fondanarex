import "server-only";

import {
  chinaDemandIndex,
  chinaDemandVerdict,
  saneGdpGrowth,
  type ChinaDemandIndex,
} from "@/domain/china/demand";
import { fetchChinaReadings, isConfigured } from "@/lib/integrations/fxmacrodata";
import { contextKeyToDb } from "@/lib/currencies";
import { prisma } from "@/lib/prisma";
import { IndicatorSource } from "@/lib/generated/prisma/enums";

/**
 * Feeds the "Demande chinoise" indicator.
 *
 * The indicator drives 15% of the AUD and NZD scores through `scoreChinaLevel`
 * and had never been fed, so the engine dropped its weight on every render.
 * This computes the composite from domain/china/demand.ts and writes it into
 * the market context, where `chinaPmi` already reads it — no scoring change,
 * no new plumbing downstream.
 *
 * TWO VALUES ARE WRITTEN, not one. `scoreChinaLevel(level, previous)` scores
 * the level and then adds a momentum term from the difference. Writing only
 * the current index would leave momentum reading zero forever, quietly
 * discarding a third of what the indicator is scored on.
 */

export interface ChinaRefreshReport {
  written: number;
  index: number | null;
  previousIndex: number | null;
  verdict: string | null;
  coverage: number;
  missing: string[];
  period: string | null;
  error: string | null;
}

/** Both keys land on the same observation date, so a page reads a matched pair. */
const KEYS = { current: "chinaPmi", previous: "chinaPmiPrev" } as const;

function empty(error: string | null): ChinaRefreshReport {
  return {
    written: 0,
    index: null,
    previousIndex: null,
    verdict: null,
    coverage: 0,
    missing: [],
    period: null,
    error,
  };
}

export async function refreshChinaDemand(userId: string): Promise<ChinaRefreshReport> {
  if (!isConfigured()) return empty("FXMACRODATA_API_KEY is not configured");

  let readings;
  try {
    readings = await fetchChinaReadings();
  } catch (error) {
    return empty(error instanceof Error ? error.message : String(error));
  }

  // The composite is built twice, from the newest reading of each series and
  // from the one before it, so the momentum term compares like with like.
  const build = (slot: 0 | 1): ChinaDemandIndex =>
    chinaDemandIndex({
      retailSalesYoY: readings.retailSales[slot] ?? null,
      cpiYoY: readings.cpi[slot] ?? null,
      unemployment: readings.unemployment[slot] ?? null,
      policyRate: readings.policyRate[slot] ?? null,
      // The prior rate for the current slot is the previous reading; for the
      // previous slot there is no reading before it, so that component drops
      // out rather than being invented.
      policyRatePrev: slot === 0 ? (readings.policyRate[1] ?? null) : null,
      gdpYoY: saneGdpGrowth(readings.gdpYoY[slot]),
    });

  const current = build(0);
  const previous = build(1);

  if (current.value === null) {
    return {
      ...empty("Couverture insuffisante des séries chinoises"),
      coverage: current.coverage,
      missing: current.missing,
    };
  }

  const observedOn = new Date();
  observedOn.setUTCHours(0, 0, 0, 0);

  const write = async (key: string, value: number): Promise<void> => {
    const dbKey = contextKeyToDb(key);
    await prisma.marketContextValue.upsert({
      where: { userId_key_observedOn: { userId, key: dbKey, observedOn } },
      create: { userId, key: dbKey, value, observedOn, source: IndicatorSource.DERIVED },
      update: { value, source: IndicatorSource.DERIVED },
    });
  };

  await write(KEYS.current, current.value);

  // Only when it exists. Writing the current value as its own predecessor
  // would fake a momentum of exactly zero, which reads as "China is steady"
  // rather than "we do not know yet".
  let written = 1;
  if (previous.value !== null) {
    await write(KEYS.previous, previous.value);
    written += 1;
  }

  return {
    written,
    index: current.value,
    previousIndex: previous.value,
    verdict: chinaDemandVerdict(current.value),
    coverage: current.coverage,
    missing: current.missing,
    period: readings.latestPeriod,
    error: null,
  };
}
