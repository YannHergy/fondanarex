import "server-only";

import {
  gdtVerdict,
  isStale,
  nextGdtAuction,
  parseEventSummary,
  parseTwelveEvents,
  type GdtHistoryPoint,
} from "@/domain/dairy/gdt";
import { periodEnd, periodLabel } from "@/domain/macro/period";
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
 *
 * TWO WRITES, not one. The MarketContextValue row is what `scoreDairy` reads
 * as its fallback, kept for continuity. The IndicatorValue rows — the full
 * twelve-auction history GDT actually serves, not just the latest move — are
 * what make the indicator CHARTABLE like every other national source here;
 * before this, the history was fetched, its length counted, and thrown away,
 * so a genuinely live feed and a stuck one looked identical from the card.
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
const FIELD = "commodityPrice";

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

/** "YYYY-MM-DD", midnight UTC, from a GDT event's midday-UTC Date. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
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

  // Full history, oldest first, so a month holding two auctions (periodLabel
  // collapses to one row per month, same as every daily-to-monthly series
  // here) keeps its LATER auction rather than its earlier one.
  // Prochaine enchère selon la règle des 1er et 3e mardis (voir
  // nextGdtAuction), et non « +14 jours ».
  //
  // L'ancienne estimation se trompait deux fois. De date : un écart sur trois
  // fait 21 jours et non 14, elle visait alors un mardi sans enchère. D'heure
  // surtout : elle héritait de midi UTC, alors que GDT met ses résultats en
  // ligne vers 15h15. Le rafraîchissement quotidien de 13h05 UTC passait donc
  // APRÈS le repère et AVANT la publication — il consommait le déclencheur
  // sans rien trouver, et l'enchère n'était ramassée que le lendemain.
  //
  // On interroge depuis la FIN du jour de l'enchère, pas depuis son horodatage
  // de midi : `nextGdtAuction` rend la prochaine strictement postérieure, et
  // depuis midi c'est encore la mise en ligne du jour même qui l'emporterait.
  const endOfAuctionDay = new Date(event.eventDate);
  endOfAuctionDay.setUTCHours(23, 59, 59, 999);
  const estimatedNextRelease = nextGdtAuction(endOfAuctionDay);
  const points: GdtHistoryPoint[] =
    history.length > 0
      ? history
      : [
          {
            eventNumber: event.eventNumber,
            eventDate: event.eventDate,
            changePct: event.changePct,
            priceIndex: null,
          },
        ];
  const latestEventDate = points.at(-1)!.eventDate;

  let indicatorRows = 0;
  for (const point of points) {
    const end = periodEnd(isoDate(point.eventDate));
    if (!end) continue;
    await prisma.indicatorValue.upsert({
      where: {
        currencyCode_indicatorKey_period_source: {
          currencyCode: "NZD",
          indicatorKey: FIELD,
          period: periodLabel(isoDate(point.eventDate)),
          source: IndicatorSource.GDT,
        },
      },
      create: {
        currencyCode: "NZD",
        indicatorKey: FIELD,
        value: point.changePct,
        period: periodLabel(isoDate(point.eventDate)),
        periodEnd: end,
        source: IndicatorSource.GDT,
        fetchedAt: new Date(),
        ...(point.eventDate.getTime() === latestEventDate.getTime()
          ? { nextRelease: estimatedNextRelease }
          : {}),
      },
      update: {
        value: point.changePct,
        periodEnd: end,
        fetchedAt: new Date(),
        ...(point.eventDate.getTime() === latestEventDate.getTime()
          ? { nextRelease: estimatedNextRelease }
          : {}),
      },
    });
    indicatorRows += 1;
  }

  return {
    written: 1 + indicatorRows,
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

export interface GdtSeriesResult {
  field: "commodityPrice";
  label: string;
  displayUnit: string;
  context: string | null;
  history: Array<{ period: string; value: number }>;
  error: string | null;
}

const CONTEXT =
  "Les produits laitiers pèsent environ un quart des exportations néo-zélandaises : le Global Dairy Trade fixe leur prix aux enchères toutes les deux semaines, et la variation de l'indice entre deux enchères consécutives est ce que le score lit.";

/** True when GDT is the source wired for this field (NZD's dairy price only). */
export function hasGdtHistory(field: string): boolean {
  return field === "commodityPrice";
}

/**
 * Full auction history straight from GDT's own S3 bucket — used by the
 * indicator detail page's chart, fetched live rather than read back from the
 * database so the page always shows what GDT is serving RIGHT NOW.
 */
export async function getGdtHistory(field: string): Promise<GdtSeriesResult | null> {
  if (!hasGdtHistory(field)) return null;

  const base = {
    field: "commodityPrice" as const,
    label: "Produits laitiers (GDT)",
    displayUnit: "%",
    context: CONTEXT,
  };

  let payloads;
  try {
    payloads = await fetchLatestGdt();
  } catch (error) {
    return { ...base, history: [], error: error instanceof Error ? error.message : String(error) };
  }

  const parsed = parseTwelveEvents(payloads.history);
  const event = parseEventSummary(payloads.summary);
  const points = parsed.length > 0
    ? parsed
    : event
      ? [{ eventNumber: event.eventNumber, eventDate: event.eventDate, changePct: event.changePct, priceIndex: null }]
      : [];

  if (points.length === 0) {
    return { ...base, history: [], error: "Aucune donnée GDT disponible" };
  }

  return {
    ...base,
    history: points.map((p) => ({ period: isoDate(p.eventDate), value: p.changePct })),
    error: null,
  };
}
