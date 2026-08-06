import "server-only";

import {
  gdtVerdict,
  isStale,
  parseEventSummary,
  parseTwelveEvents,
} from "@/domain/dairy/gdt";
import { fetchLatestGdt } from "@/lib/integrations/gdt";
import { contextKeyToDb } from "@/lib/currencies";
import { prisma } from "@/lib/prisma";
import { IndicatorSource } from "@/lib/generated/prisma/enums";

/**
 * Feeds the "Produits laitiers" indicator for the NZD.
 *
 * `scoreDairy` reads `dairyGdtChangePct` — the percentage move of the GDT
 * Price Index between consecutive auctions — and saturates at ±10%. The field
 * had no source: FXMacroData publishes no dairy series for the NZD, which the
 * integration module notes explicitly, so the indicator was left for manual
 * entry and stayed empty.
 *
 * The value is written on the AUCTION's date, not today's. Auctions are
 * fortnightly, and dating a two-week-old reading as if it were taken this
 * morning would make a stale figure indistinguishable from a fresh one in a
 * table sorted by observation date.
 */

export interface DairyRefreshReport {
  written: number;
  changePct: number | null;
  averagePrice: number | null;
  eventNumber: number | null;
  eventDate: string | null;
  verdict: string | null;
  /** Auctions in the twelve-event history that parsed. */
  historyPoints: number;
  stale: boolean;
  error: string | null;
}

const KEY = "dairyGdtChangePct";

function empty(error: string): DairyRefreshReport {
  return {
    written: 0,
    changePct: null,
    averagePrice: null,
    eventNumber: null,
    eventDate: null,
    verdict: null,
    historyPoints: 0,
    stale: false,
    error,
  };
}

export async function refreshDairyGdt(userId: string): Promise<DairyRefreshReport> {
  let payloads;
  try {
    payloads = await fetchLatestGdt();
  } catch (error) {
    return empty(error instanceof Error ? error.message : String(error));
  }

  const event = parseEventSummary(payloads.summary);
  if (!event) return empty("Résultat GDT illisible ou implausible");

  const history = parseTwelveEvents(payloads.history);

  // Midnight UTC on the auction day: `getMarketContext` keeps the newest row
  // per key, and the auction date is what "newest" must mean here.
  const observedOn = new Date(event.eventDate);
  observedOn.setUTCHours(0, 0, 0, 0);

  const dbKey = contextKeyToDb(KEY);
  await prisma.marketContextValue.upsert({
    where: { userId_key_observedOn: { userId, key: dbKey, observedOn } },
    create: {
      userId,
      key: dbKey,
      value: event.changePct,
      observedOn,
      source: IndicatorSource.MARKET,
    },
    update: { value: event.changePct, source: IndicatorSource.MARKET },
  });

  return {
    written: 1,
    changePct: event.changePct,
    averagePrice: event.averagePrice,
    eventNumber: event.eventNumber,
    eventDate: event.eventDate.toISOString().slice(0, 10),
    verdict: gdtVerdict(event.changePct),
    historyPoints: history.length,
    // The clock enters here and nowhere deeper: the domain layer owns none.
    stale: isStale(event, new Date()),
    error: null,
  };
}
