import "server-only";

import { trailingChangePct } from "@/domain/macro/market-series";
import { fetchOilDaily } from "@/lib/integrations/oil";
import { contextKeyToDb } from "@/lib/currencies";
import { prisma } from "@/lib/prisma";
import { IndicatorSource } from "@/lib/generated/prisma/enums";

/**
 * Feeds the "Pétrole WTI" indicator for the CAD.
 *
 * `scoreOil` reads `oilChangePct` and saturates at ±15%, and the field had no
 * source: FXMacroData publishes no oil series for the CAD, so the indicator
 * was left for manual entry at 22% of the CAD profile — the single heaviest
 * indicator of any currency in the model, and it was empty.
 *
 * `fetchOil` already existed and fed a monthly ROW into IndicatorValue. That
 * is a different thing from this: a stored price level, not the market-context
 * percentage the scorer reads. Both now come from the same Yahoo request.
 */

/**
 * The trailing window, in calendar days.
 *
 * Thirty, matching the horizon `scoreOil`'s ±15% saturation was written for —
 * a barrel moving 15% in a month is a major move, while 15% in a week is not
 * unusual and would peg the score most weeks.
 */
const WINDOW_DAYS = 30;

export interface OilRefreshReport {
  written: number;
  changePct: number | null;
  /** Latest close, USD per barrel. */
  price: number | null;
  from: string | null;
  to: string | null;
  spanDays: number | null;
  error: string | null;
}

const KEY = "oilChangePct";

function empty(error: string): OilRefreshReport {
  return {
    written: 0,
    changePct: null,
    price: null,
    from: null,
    to: null,
    spanDays: null,
    error,
  };
}

export async function refreshOilChange(userId: string): Promise<OilRefreshReport> {
  let daily;
  try {
    daily = await fetchOilDaily();
  } catch (error) {
    return empty(error instanceof Error ? error.message : String(error));
  }

  const change = trailingChangePct(daily, WINDOW_DAYS);
  if (!change) return empty("Série WTI insuffisante pour mesurer une variation");

  // Dated on the latest SESSION, not on today: a Monday morning refresh reads
  // Friday's close, and the row must say so. `getMarketContext` keeps the
  // newest row per key, so this is also what makes a re-run idempotent within
  // the same trading day rather than piling up one row per refresh.
  const observedOn = new Date(`${change.to.date}T00:00:00Z`);

  const dbKey = contextKeyToDb(KEY);
  const value = Math.round(change.changePct * 100) / 100;

  await prisma.marketContextValue.upsert({
    where: { userId_key_observedOn: { userId, key: dbKey, observedOn } },
    create: { userId, key: dbKey, value, observedOn, source: IndicatorSource.MARKET },
    update: { value, source: IndicatorSource.MARKET },
  });

  return {
    written: 1,
    changePct: value,
    price: change.to.close,
    from: change.from.date,
    to: change.to.date,
    spanDays: change.spanDays,
    error: null,
  };
}
