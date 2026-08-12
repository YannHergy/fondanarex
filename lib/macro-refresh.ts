import "server-only";

import { periodEnd, periodLabel } from "@/domain/macro/period";
import { ensureIndicatorCommentary } from "@/lib/commentary";
import { fetchEcbData } from "@/lib/integrations/ecb";
import { fetchEurostatData } from "@/lib/integrations/eurostat";
import { fetchOnsData } from "@/lib/integrations/ons";
import { fetchAllOecdData } from "@/lib/integrations/oecd";
import { fetchFredCsvData } from "@/lib/integrations/fred-csv";
import {
  fetchAllFxMacroCoreData,
  isConfigured as fxMacroDataConfigured,
} from "@/lib/integrations/fxmacrodata";
import type { MonthlyReading } from "@/domain/macro/market-series";
import { fetchJapanCpi, fetchTokyoCpi } from "@/lib/integrations/estat";
import { fetchRbaData } from "@/lib/integrations/rba";
import { fetchSnbCpi } from "@/lib/integrations/snb";
import { fetchStatCanData } from "@/lib/integrations/statcan";
import { fetchStatsNzCpi } from "@/lib/integrations/statsnz";
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

/**
 * An ISO timestamp or bare date to a real instant, or null.
 *
 * Separate from periodEnd() on purpose: that one maps a period LABEL
 * ("2026-Q1") to the last day of the period, which is the right rule for a
 * reference period and the wrong one for a publication moment.
 */
function parseInstant(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

  const [
    oecdResults,
    fredCsvResults,
    fxMacroResults,
    eurostatResults,
    ecbResults,
    onsResults,
    vixResult,
    oilResult,
    tokyoCpiResult,
    japanCpiResult,
    snbCpiResult,
    statCanResults,
    rbaResults,
    statsNzCpiResult,
  ] = await Promise.all([
    fetchAllOecdData(options.oecdFields),
    options.skipFred ? Promise.resolve([]) : fetchFredCsvData(),
    fxMacroDataConfigured() ? fetchAllFxMacroCoreData() : Promise.resolve([]),
    fetchEurostatData(),
    fetchEcbData(),
    fetchOnsData(),
    fetchVix().catch(asError),
    fetchOil().catch(asError),
    fetchTokyoCpi().catch(asError),
    fetchJapanCpi(),
    fetchSnbCpi(),
    fetchStatCanData(),
    fetchRbaData(),
    fetchStatsNzCpi(),
  ]);

  // ── Eurostat: the EUR, from its own publisher ───────────────────────────
  //
  // The FULL history is written, not just the latest reading. Every other
  // source here stores at most two periods, which is enough to score momentum
  // but leaves the score curve with nothing to draw before today. Eurostat
  // hands over decades in the same response it would take to fetch one point,
  // so refusing it would be throwing away the only free backfill available.
  //
  // Re-running is cheap despite the row count: writeRows upserts on
  // (currency, indicator, period, source), so a second run updates the same
  // rows rather than growing the table.
  if (known.has("EUR")) {
    for (const series of eurostatResults) {
      if (series.error || series.history.length === 0) {
        const message = series.error ?? "aucune donnée";
        errors.push(`Eurostat ${series.label}: ${message}`);
        sources.push({
          source: "EUROSTAT",
          label: series.label,
          written: 0,
          error: message,
        });
        continue;
      }

      // Eurostat's bulk API carries no release calendar — only FXMacroData
      // does, and it is still fetched and written in parallel for the very
      // same fields, just losing the tier race now that Eurostat outranks it.
      // Without this, every EUR indicator Eurostat now sources would show
      // "Prochaine : —" despite a real date sitting one row away in the same
      // table, under a different source.
      //
      // Attached to the LATEST point only: `nextRelease` is read from rn=1
      // alone (see lib/currencies.ts), so a historical row has no use for one
      // and older Eurostat rows are correctly left without.
      const fxNextRelease = parseInstant(
        fxMacroResults.find((d) => d.field === series.field)?.values.EUR?.nextRelease ?? null,
      );
      const latestIndex = series.history.length - 1;

      const rows: PendingRow[] = [];
      series.history.forEach((point, index) => {
        const end = periodEnd(point.period);
        if (!end) return;

        rows.push({
          currencyCode: "EUR",
          indicatorKey: series.field,
          value: point.value,
          period: periodLabel(point.period),
          periodEnd: end,
          source: IndicatorSource.EUROSTAT,
          ...(index === latestIndex ? { nextRelease: fxNextRelease } : {}),
        });
      });

      const written = await writeRows(rows);
      sources.push({ source: "EUROSTAT", label: series.label, written, error: null });

      // Best-effort, and deliberately outside `writeRows`: the reading is
      // already committed by the time this runs, so a Gemini failure here —
      // quota, timeout, an unparsable reply — must cost only the sentence.
      if (written > 0) {
        await ensureIndicatorCommentary({
          currencyCode: "EUR",
          indicatorKey: series.field,
          source: IndicatorSource.EUROSTAT,
          label: series.label,
          unit: series.displayUnit,
          sourceLabel: "Eurostat",
          context: series.context,
        }).catch(() => {});
      }
    }
  }

  // ── ECB: the EUR policy rate, from the central bank itself ──────────────
  //
  // Eurostat does not publish this (verified live — its money-market table
  // only carries interbank rates, never the rate the ECB itself sets), so it
  // cannot join the loop above. Same free-and-unlimited-history reasoning as
  // Eurostat otherwise: the full series is written, not just the latest
  // reading, and periodLabel() collapses this DAILY series down to one row
  // per month on write (the unique key is currency+indicator+period+source),
  // so upserting ~1300 daily points costs about 43 rows, not 1300.
  if (known.has("EUR")) {
    for (const series of ecbResults) {
      if (series.error || series.history.length === 0) {
        const message = series.error ?? "aucune donnée";
        errors.push(`BCE ${series.label}: ${message}`);
        sources.push({ source: "ECB", label: series.label, written: 0, error: message });
        continue;
      }

      const fxNextRelease = parseInstant(
        fxMacroResults.find((d) => d.field === series.field)?.values.EUR?.nextRelease ?? null,
      );
      const latestIndex = series.history.length - 1;

      const rows: PendingRow[] = [];
      series.history.forEach((point, index) => {
        const end = periodEnd(point.period);
        if (!end) return;

        rows.push({
          currencyCode: "EUR",
          indicatorKey: series.field,
          value: point.value,
          period: periodLabel(point.period),
          periodEnd: end,
          source: IndicatorSource.ECB,
          ...(index === latestIndex ? { nextRelease: fxNextRelease } : {}),
        });
      });

      const written = await writeRows(rows);
      sources.push({ source: "ECB", label: series.label, written, error: null });

      if (written > 0) {
        await ensureIndicatorCommentary({
          currencyCode: "EUR",
          indicatorKey: series.field,
          source: IndicatorSource.ECB,
          label: series.label,
          unit: series.displayUnit,
          sourceLabel: "BCE",
          context: series.context,
        }).catch(() => {});
      }
    }
  }

  // ── ONS: the GBP, from its own statistical office ───────────────────────
  //
  // Same shape as the Eurostat block, with one difference worth having: the
  // ONS publishes its own release calendar on every series, so the next
  // release comes from the source rather than being borrowed from
  // FXMacroData the way the euro-area rows have to.
  if (known.has("GBP")) {
    for (const series of onsResults) {
      if (series.error || series.history.length === 0) {
        const message = series.error ?? "aucune donnée";
        errors.push(`ONS ${series.label}: ${message}`);
        sources.push({ source: "ONS", label: series.label, written: 0, error: message });
        continue;
      }

      const nextRelease =
        parseInstant(series.nextRelease) ??
        parseInstant(
          fxMacroResults.find((d) => d.field === series.field)?.values.GBP?.nextRelease ?? null,
        );
      const latestIndex = series.history.length - 1;

      const rows: PendingRow[] = [];
      series.history.forEach((point, index) => {
        const end = periodEnd(point.period);
        if (!end) return;

        rows.push({
          currencyCode: "GBP",
          indicatorKey: series.field,
          value: point.value,
          period: periodLabel(point.period),
          periodEnd: end,
          source: IndicatorSource.ONS,
          ...(index === latestIndex ? { nextRelease } : {}),
        });
      });

      const written = await writeRows(rows);
      sources.push({ source: "ONS", label: series.label, written, error: null });

      if (written > 0) {
        await ensureIndicatorCommentary({
          currencyCode: "GBP",
          indicatorKey: series.field,
          source: IndicatorSource.ONS,
          label: series.label,
          unit: series.displayUnit,
          sourceLabel: "ONS",
          context: series.context,
        }).catch(() => {});
      }
    }
  }

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

  // ── FRED: the USD in full, plus gaps for four other currencies ──────────
  //
  // Through the key-free CSV export (see lib/integrations/fred-csv.ts), which
  // replaced the keyed JSON path here. That path had never once run — its key
  // has never been configured — and it derived year-on-year rates itself,
  // arithmetic that produced 3.88% for a US inflation print published at 3.5%.
  // The CSV export asks FRED for the rate instead of computing it.
  for (const series of fredCsvResults) {
    if (!known.has(series.currency)) continue;

    if (series.error || series.history.length === 0) {
      const message = series.error ?? "aucune donnée";
      errors.push(`FRED ${series.currency} ${series.label}: ${message}`);
      sources.push({
        source: "FRED",
        label: `${series.currency} ${series.label}`,
        written: 0,
        error: message,
      });
      continue;
    }

    const fxNextRelease = parseInstant(
      fxMacroResults.find((d) => d.field === series.field)?.values[
        series.currency as keyof (typeof fxMacroResults)[number]["values"]
      ]?.nextRelease ?? null,
    );
    const latestIndex = series.history.length - 1;

    const rows: PendingRow[] = [];
    series.history.forEach((point, index) => {
      const end = periodEnd(point.period);
      if (!end) return;

      rows.push({
        currencyCode: series.currency,
        indicatorKey: series.field,
        value: point.value,
        period: periodLabel(point.period),
        periodEnd: end,
        source: IndicatorSource.FRED,
        ...(index === latestIndex ? { nextRelease: fxNextRelease } : {}),
      });
    });

    const written = await writeRows(rows);
    sources.push({
      source: "FRED",
      label: `${series.currency} ${series.label}`,
      written,
      error: null,
    });

    if (written > 0) {
      await ensureIndicatorCommentary({
        currencyCode: series.currency,
        indicatorKey: series.field,
        source: IndicatorSource.FRED,
        label: series.label,
        unit: series.displayUnit,
        sourceLabel: "FRED",
        context: series.context,
      }).catch(() => {});
    }
  }

  // ── Statistics Bureau of Japan: the national CPI ────────────────────────
  //
  // Same endpoint, same indicator and the same request as the Tokyo print
  // already fetched above — only the region differs. FRED's Japanese CPI was
  // the obvious alternative and it is dead: its OECD feed stopped in 2021.
  if (known.has("JPY")) {
    if (japanCpiResult.error || japanCpiResult.history.length === 0) {
      const message = japanCpiResult.error ?? "aucune donnée";
      errors.push(`CPI Japon: ${message}`);
      sources.push({ source: "ESTAT", label: "CPI Japon", written: 0, error: message });
    } else {
      const fxNextRelease = parseInstant(
        fxMacroResults.find((d) => d.field === "cpi")?.values.JPY?.nextRelease ?? null,
      );
      const latestIndex = japanCpiResult.history.length - 1;

      const rows: PendingRow[] = [];
      japanCpiResult.history.forEach((point, index) => {
        const end = periodEnd(point.period);
        if (!end) return;
        rows.push({
          currencyCode: "JPY",
          indicatorKey: "cpi",
          value: point.value,
          period: periodLabel(point.period),
          periodEnd: end,
          source: IndicatorSource.ESTAT,
          ...(index === latestIndex ? { nextRelease: fxNextRelease } : {}),
        });
      });

      const written = await writeRows(rows);
      sources.push({ source: "ESTAT", label: "CPI Japon", written, error: null });

      if (written > 0) {
        await ensureIndicatorCommentary({
          currencyCode: "JPY",
          indicatorKey: "cpi",
          source: IndicatorSource.ESTAT,
          label: japanCpiResult.label,
          unit: japanCpiResult.displayUnit,
          sourceLabel: "Statistics Bureau of Japan",
          context: japanCpiResult.context,
        }).catch(() => {});
      }
    }
  }

  // ── SNB: Swiss inflation ────────────────────────────────────────────────
  //
  // The only macro indicator in the CHF profile, and 16% of its score.
  if (known.has("CHF")) {
    if (snbCpiResult.error || snbCpiResult.history.length === 0) {
      const message = snbCpiResult.error ?? "aucune donnée";
      errors.push(`CPI Suisse: ${message}`);
      sources.push({ source: "SNB", label: "CPI Suisse", written: 0, error: message });
    } else {
      const fxNextRelease = parseInstant(
        fxMacroResults.find((d) => d.field === "cpi")?.values.CHF?.nextRelease ?? null,
      );
      const latestIndex = snbCpiResult.history.length - 1;

      const rows: PendingRow[] = [];
      snbCpiResult.history.forEach((point, index) => {
        const end = periodEnd(point.period);
        if (!end) return;
        rows.push({
          currencyCode: "CHF",
          indicatorKey: "cpi",
          value: point.value,
          period: periodLabel(point.period),
          periodEnd: end,
          source: IndicatorSource.SNB,
          ...(index === latestIndex ? { nextRelease: fxNextRelease } : {}),
        });
      });

      const written = await writeRows(rows);
      sources.push({ source: "SNB", label: "CPI Suisse", written, error: null });

      if (written > 0) {
        await ensureIndicatorCommentary({
          currencyCode: "CHF",
          indicatorKey: "cpi",
          source: IndicatorSource.SNB,
          label: snbCpiResult.label,
          unit: snbCpiResult.displayUnit,
          sourceLabel: "BNS",
          context: snbCpiResult.context,
        }).catch(() => {});
      }
    }
  }

  // ── Statistics Canada and the RBA: the CAD and AUD price indices ────────
  //
  // Both fill the same gap for their currency: FRED carries a CPI for each
  // and both come through OECD's Main Economic Indicators, a feed that
  // stopped in 2025 while still answering HTTP 200. Same shape as the blocks
  // above, so they share one loop.
  for (const national of [
    { code: "CAD", source: IndicatorSource.STATCAN, label: "StatCan", results: statCanResults },
    { code: "AUD", source: IndicatorSource.RBA, label: "RBA", results: rbaResults },
    { code: "NZD", source: IndicatorSource.STATSNZ, label: "Stats NZ", results: [statsNzCpiResult] },
  ] as const) {
    if (!known.has(national.code)) continue;

    for (const series of national.results) {
      if (series.error || series.history.length === 0) {
        const message = series.error ?? "aucune donnée";
        errors.push(`${national.label} ${series.label}: ${message}`);
        sources.push({
          source: national.label,
          label: series.label,
          written: 0,
          error: message,
        });
        continue;
      }

      const fxNextRelease = parseInstant(
        fxMacroResults.find((d) => d.field === series.field)?.values[national.code]?.nextRelease ??
          null,
      );
      const latestIndex = series.history.length - 1;

      const rows: PendingRow[] = [];
      series.history.forEach((point, index) => {
        const end = periodEnd(point.period);
        if (!end) return;
        rows.push({
          currencyCode: national.code,
          indicatorKey: series.field,
          value: point.value,
          period: periodLabel(point.period),
          periodEnd: end,
          source: national.source,
          ...(index === latestIndex ? { nextRelease: fxNextRelease } : {}),
        });
      });

      const written = await writeRows(rows);
      sources.push({ source: national.label, label: series.label, written, error: null });

      if (written > 0) {
        await ensureIndicatorCommentary({
          currencyCode: national.code,
          indicatorKey: series.field,
          source: national.source,
          label: series.label,
          unit: series.displayUnit,
          sourceLabel: national.label,
          context: series.context,
        }).catch(() => {});
      }
    }
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
        // Parsed as a full instant, not through periodEnd(): that helper
        // resolves a period LABEL to the last day of the period, which would
        // turn "2026-09-11T08:30:00-04:00" into a date at midnight and throw
        // the release hour away.
        nextRelease: parseInstant(point.nextRelease),
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
