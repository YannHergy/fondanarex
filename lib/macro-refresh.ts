import "server-only";

import { periodEnd, periodLabel } from "@/domain/macro/period";
import { fetchAllOecdData } from "@/lib/integrations/oecd";
import { fetchFredUsdData, isConfigured as fredConfigured } from "@/lib/integrations/fred";
import {
  fetchAllFxMacroCoreData,
  isConfigured as fxMacroDataConfigured,
} from "@/lib/integrations/fxmacrodata";
import type { MonthlyReading } from "@/domain/macro/market-series";
import { fetchTokyoCpi } from "@/lib/integrations/estat";
import { fetchOil } from "@/lib/integrations/oil";
import { fetchVix } from "@/lib/integrations/vix";
import { prisma } from "@/lib/prisma";
import { IndicatorSource } from "@/lib/generated/prisma/enums";

/**
 * Macro data ingestion.
 *
 * This is what makes the scores live. It fetches the OECD (all eight
 * currencies), FRED (the USD, at higher precision) and FXMacroData (policy
 * rate, CPI, core CPI, GDP, unemployment and trade balance, all eight
 * currencies — the indicators OECD/FRED were meant to cover but whose own
 * automation has never run) and writes the readings into IndicatorValue.
 *
 * Two guarantees hold by construction:
 *
 *   1. It NEVER writes IndicatorOverride. A user's manual correction lives in a
 *      different table and always wins on read, so a refresh cannot silently
 *      overwrite hand-entered data. The legacy app relied on a hand-maintained
 *      PROTECTED_FIELDS allowlist for this, which only worked as long as
 *      somebody remembered to extend it.
 *
 *   2. Rows are keyed by (currency, indicator, period, source). Re-running a
 *      refresh updates the row for that period in place instead of appending a
 *      duplicate, and a new publication creates a new period row — which is
 *      what gives every indicator its history and its "previous" value.
 *
 * A note on what "live" can mean here: these are macro fundamentals. CPI is
 * monthly, GDP quarterly, policy rates decided at scheduled meetings. There is
 * no tick-by-tick movement to capture — freshness is bounded by the publication
 * calendar, not by how often this runs.
 */

export interface RefreshReport {
  startedAt: string;
  durationMs: number;
  /** Rows created or updated. */
  written: number;
  sources: Array<{ source: string; label: string; written: number; error: string | null }>;
  errors: string[];
}

interface PendingRow {
  currencyCode: string;
  indicatorKey: string;
  value: number;
  period: string;
  periodEnd: Date;
  source: IndicatorSource;
  /**
   * Expected date of the next publication. OECD/FRED never supply one — the
   * UI simply shows no date for those rows, as it always has. FXMacroData's
   * own forecast calendar does, and omitting it here would have been a
   * regression: switching an indicator's source loses the "Prochaine : ..."
   * date the seeded MANUAL row happened to carry, for no reason other than
   * the new row never being asked for one.
   */
  nextRelease?: Date | null;
  /** The provider reports this reading as out of date — see IndicatorValue.sourceStale. */
  sourceStale?: boolean;
}

/**
 * Writes readings, one upsert per row.
 *
 * Deliberately not createMany+skipDuplicates: a refresh must UPDATE the current
 * period when a figure is revised, and skipDuplicates would silently keep the
 * stale value.
 */
async function writeRows(rows: PendingRow[]): Promise<number> {
  let written = 0;

  for (const row of rows) {
    await prisma.indicatorValue.upsert({
      where: {
        currencyCode_indicatorKey_period_source: {
          currencyCode: row.currencyCode,
          indicatorKey: row.indicatorKey,
          period: row.period,
          source: row.source,
        },
      },
      create: { ...row, fetchedAt: new Date() },
      update: {
        value: row.value,
        periodEnd: row.periodEnd,
        fetchedAt: new Date(),
        ...(row.nextRelease !== undefined ? { nextRelease: row.nextRelease } : {}),
        ...(row.sourceStale !== undefined ? { sourceStale: row.sourceStale } : {}),
      },
    });
    written += 1;
  }

  return written;
}

/** Currencies that exist in the database, so a reading for an untracked area is dropped. */
async function knownCurrencyCodes(): Promise<Set<string>> {
  const rows = await prisma.currency.findMany({ select: { code: true } });
  return new Set(rows.map((r) => r.code));
}

export interface RefreshOptions {
  /**
   * Restrict the OECD pull to these indicator fields.
   *
   * The OECD rate-limits hard enough that fetching all five datasets in one run
   * takes ~30 seconds of deliberate spacing — more than a synchronous Netlify
   * function is allowed. The scheduler therefore walks one dataset per
   * invocation; leaving this empty pulls everything, which is what the manual
   * refresh button does.
   */
  oecdFields?: readonly string[];
  /** Skip FRED, e.g. when a run is only topping up one OECD dataset. */
  skipFred?: boolean;
}

export async function refreshMacroData(options: RefreshOptions = {}): Promise<RefreshReport> {
  const started = Date.now();
  const sources: RefreshReport["sources"] = [];
  const errors: string[] = [];

  const known = await knownCurrencyCodes();
  const asError = (error: unknown) =>
    error instanceof Error ? error : new Error(String(error));

  const [oecdResults, fredResults, fxMacroResults, vixResult, oilResult, tokyoCpiResult] =
    await Promise.all([
      fetchAllOecdData(options.oecdFields),
      !options.skipFred && fredConfigured() ? fetchFredUsdData() : Promise.resolve([]),
      fxMacroDataConfigured() ? fetchAllFxMacroCoreData() : Promise.resolve([]),
      fetchVix().catch(asError),
      fetchOil().catch(asError),
      fetchTokyoCpi().catch(asError),
    ]);

  // ── OECD: every currency ────────────────────────────────────────────────
  for (const dataset of oecdResults) {
    if (dataset.error) {
      errors.push(`OECD ${dataset.label}: ${dataset.error}`);
      sources.push({
        source: "OECD",
        label: dataset.label,
        written: 0,
        error: dataset.error,
      });
      continue;
    }

    const rows: PendingRow[] = [];
    for (const [currencyCode, point] of Object.entries(dataset.values)) {
      if (!known.has(currencyCode)) continue;

      const end = periodEnd(point.latestPeriod);
      if (!end) continue;

      rows.push({
        currencyCode,
        indicatorKey: dataset.field,
        value: point.current,
        period: periodLabel(point.latestPeriod),
        periodEnd: end,
        source: IndicatorSource.OECD,
      });

      // The prior reading is stored as its own dated row, not discarded. Every
      // momentum scorer needs a previous value, and with only the latest row
      // present they fall back to "no change" — a currency whose inflation is
      // accelerating would score as flat.
      if (point.previousPeriod) {
        const priorEnd = periodEnd(point.previousPeriod);
        if (priorEnd) {
          rows.push({
            currencyCode,
            indicatorKey: dataset.field,
            value: point.previous,
            period: periodLabel(point.previousPeriod),
            periodEnd: priorEnd,
            source: IndicatorSource.OECD,
          });
        }
      }
    }

    const written = await writeRows(rows);
    sources.push({ source: "OECD", label: dataset.label, written, error: null });
  }

  // ── FRED: the USD only, at higher precision ─────────────────────────────
  if (!options.skipFred && !fredConfigured()) {
    errors.push("FRED: clé API absente — données USD issues de l'OECD uniquement");
  }

  for (const series of fredResults) {
    if (series.error || !series.value) {
      const message = series.error ?? "aucune donnée";
      errors.push(`FRED ${series.field}: ${message}`);
      sources.push({ source: "FRED", label: series.field, written: 0, error: message });
      continue;
    }

    const end = periodEnd(series.value.observedOn);
    if (!end) {
      sources.push({
        source: "FRED",
        label: series.field,
        written: 0,
        error: `Période illisible: ${series.value.observedOn}`,
      });
      continue;
    }

    const rows: PendingRow[] = [
      {
        currencyCode: "USD",
        indicatorKey: series.field,
        value: series.value.current,
        period: periodLabel(series.value.period),
        periodEnd: end,
        source: IndicatorSource.FRED,
      },
    ];

    // Same reasoning as the OECD branch: persist the prior reading so momentum
    // has something to compare against.
    const priorEnd = periodEnd(series.value.previousObservedOn);
    if (priorEnd && series.value.previousPeriod !== series.value.period) {
      rows.push({
        currencyCode: "USD",
        indicatorKey: series.field,
        value: series.value.previous,
        period: periodLabel(series.value.previousPeriod),
        periodEnd: priorEnd,
        source: IndicatorSource.FRED,
      });
    }

    const written = await writeRows(rows);

    sources.push({ source: "FRED", label: series.field, written, error: null });
  }

  // ── FXMacroData: core indicators, every currency ────────────────────────
  if (!fxMacroDataConfigured()) {
    errors.push("FXMacroData: clé API absente");
  }

  for (const dataset of fxMacroResults) {
    if (Object.keys(dataset.values).length === 0) {
      const message = dataset.error ?? "aucune donnée";
      errors.push(`FXMacroData ${dataset.label}: ${message}`);
      sources.push({ source: "FXMACRODATA", label: dataset.label, written: 0, error: message });
      continue;
    }

    const rows: PendingRow[] = [];
    for (const [currencyCode, point] of Object.entries(dataset.values)) {
      if (!known.has(currencyCode)) continue;

      const end = periodEnd(point.latestPeriod);
      if (!end) continue;

      rows.push({
        currencyCode,
        indicatorKey: dataset.field,
        value: point.current,
        period: periodLabel(point.latestPeriod),
        periodEnd: end,
        source: IndicatorSource.FXMACRODATA,
        nextRelease: point.nextRelease ? periodEnd(point.nextRelease) : null,
        sourceStale: point.stale,
      });

      // Same reasoning as OECD/FRED: persist the prior reading so momentum
      // has something to compare against.
      if (point.previousPeriod) {
        const priorEnd = periodEnd(point.previousPeriod);
        if (priorEnd) {
          rows.push({
            currencyCode,
            indicatorKey: dataset.field,
            value: point.previous,
            period: periodLabel(point.previousPeriod),
            periodEnd: priorEnd,
            source: IndicatorSource.FXMACRODATA,
          });
        }
      }
    }

    const written = await writeRows(rows);
    sources.push({ source: "FXMACRODATA", label: dataset.label, written, error: dataset.error });
  }

  // ── Market quotes: the VIX and the oil barrel ───────────────────────────
  //
  // One market-wide number each, stored PER CURRENCY because the scoring
  // engine reads them off CurrencyData. The engine handles the direction
  // itself: a high VIX is bullish for the safe havens (JPY, CHF) and bearish
  // for the pro-cyclicals (AUD, NZD), so the same value goes to all four and
  // riskOffFromVix plus the safe-haven sign flip do the rest.
  const MARKET_SERIES: ReadonlyArray<{
    label: string;
    indicatorKey: string;
    currencies: readonly string[];
    result: MonthlyReading | Error;
  }> = [
    {
      label: "Sentiment risque (VIX)",
      indicatorKey: "riskSentiment",
      currencies: ["AUD", "NZD", "JPY", "CHF"],
      result: vixResult,
    },
    {
      label: "Pétrole (WTI)",
      indicatorKey: "oilPrice",
      currencies: ["CAD"],
      result: oilResult,
    },
  ];

  for (const series of MARKET_SERIES) {
    if (series.result instanceof Error) {
      errors.push(`${series.label}: ${series.result.message}`);
      sources.push({
        source: "MARKET",
        label: series.label,
        written: 0,
        error: series.result.message,
      });
      continue;
    }

    const reading = series.result;
    const rows: PendingRow[] = [];
    const end = periodEnd(reading.period);
    const priorEnd = reading.previousPeriod ? periodEnd(reading.previousPeriod) : null;

    for (const currencyCode of series.currencies) {
      if (!known.has(currencyCode)) continue;
      if (end) {
        rows.push({
          currencyCode,
          indicatorKey: series.indicatorKey,
          value: reading.current,
          period: reading.period,
          periodEnd: end,
          source: IndicatorSource.MARKET,
        });
      }
      if (priorEnd && reading.previousPeriod) {
        rows.push({
          currencyCode,
          indicatorKey: series.indicatorKey,
          value: reading.previous,
          period: reading.previousPeriod,
          periodEnd: priorEnd,
          source: IndicatorSource.MARKET,
        });
      }
    }

    const written = await writeRows(rows);
    sources.push({ source: "MARKET", label: series.label, written, error: null });
  }

  // ── Statistics Bureau of Japan: the Tokyo CPI ────────────────────────────
  //
  // 12% of the JPY profile, and the only source that carries it: FXMacroData
  // has no slug for it and FRED's 230 Japanese CPI series are national only.
  // Filed under OECD tier rather than MARKET — it is an official statistical
  // release, not a quote — which also keeps it below FXMacroData should that
  // ever start publishing one.
  if (tokyoCpiResult instanceof Error) {
    errors.push(`CPI Tokyo: ${tokyoCpiResult.message}`);
    sources.push({
      source: "ESTAT",
      label: "CPI Tokyo",
      written: 0,
      error: tokyoCpiResult.message,
    });
  } else if (!known.has("JPY")) {
    sources.push({ source: "ESTAT", label: "CPI Tokyo", written: 0, error: "JPY absent" });
  } else {
    const rows: PendingRow[] = [];
    const end = periodEnd(tokyoCpiResult.period);
    if (end) {
      rows.push({
        currencyCode: "JPY",
        indicatorKey: "tokyoCpi",
        value: tokyoCpiResult.current,
        period: tokyoCpiResult.period,
        periodEnd: end,
        source: IndicatorSource.ESTAT,
      });
    }
    if (tokyoCpiResult.previousPeriod) {
      const priorEnd = periodEnd(tokyoCpiResult.previousPeriod);
      if (priorEnd) {
        rows.push({
          currencyCode: "JPY",
          indicatorKey: "tokyoCpi",
          value: tokyoCpiResult.previous,
          period: tokyoCpiResult.previousPeriod,
          periodEnd: priorEnd,
          source: IndicatorSource.ESTAT,
        });
      }
    }

    const written = await writeRows(rows);
    sources.push({ source: "ESTAT", label: "CPI Tokyo", written, error: null });
  }

  const written = sources.reduce((sum, s) => sum + s.written, 0);

  // Cache invalidation is deliberately NOT done here. `revalidatePath` requires
  // a Next request context, so calling it would make this function unusable
  // from a script or a test — and ingestion has no business knowing about the
  // render cache anyway. Callers that run inside a request invalidate.

  return {
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    written,
    sources,
    errors,
  };
}
