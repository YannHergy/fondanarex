import "server-only";

import { cache } from "react";

import { calculateAllScores } from "@/domain/scoring";
import type {
  CentralBankStance,
  CurrencyCategory,
  CurrencyData,
  CurrencyWithScore,
  MarketContext,
  SnbIntervention,
} from "@/domain/types";
import { EMPTY_MARKET_CONTEXT } from "@/domain/market-context";
import { prisma } from "@/lib/prisma";
import { CurrencyCategory as DbCategory, Stance as DbStance } from "@/lib/generated/prisma/enums";

/**
 * Assembly of the currency data the scoring engine consumes.
 *
 * The legacy app kept one blob in localStorage (`dipper_app_data_v2`) that mixed
 * three different kinds of data with three different owners:
 *
 *   - objective macro readings, fetched from OECD/FRED — global, shared
 *   - the user's manual corrections to those readings
 *   - the user's free-text notes and stance calls
 *
 * Because they shared one object, an API refresh could overwrite a manual entry.
 * `unifiedDataService.ts` defended against that with a hand-maintained
 * PROTECTED_FIELDS allowlist — which only worked as long as someone remembered
 * to add each new field to it.
 *
 * Here the three live in three tables and the rule is structural: a refresh
 * writes IndicatorValue, a manual edit writes IndicatorOverride, and reads
 * prefer the override. A refresh cannot clobber manual input because it never
 * touches the table manual input lives in.
 */

// ── Enum translation between the database and the domain ───────────────────

const STANCE_TO_DOMAIN: Record<DbStance, CentralBankStance> = {
  VERY_HAWKISH: "Very Hawkish",
  HAWKISH: "Hawkish",
  NEUTRAL: "Neutral",
  DOVISH: "Dovish",
  VERY_DOVISH: "Very Dovish",
};

export const STANCE_TO_DB: Record<CentralBankStance, DbStance> = {
  "Very Hawkish": "VERY_HAWKISH",
  Hawkish: "HAWKISH",
  Neutral: "NEUTRAL",
  Dovish: "DOVISH",
  "Very Dovish": "VERY_DOVISH",
};

const CATEGORY_TO_DOMAIN: Record<DbCategory, CurrencyCategory> = {
  SAFE_HAVEN: "Safe-Haven",
  RISK_ON: "Risk-On",
  NEUTRAL: "Neutral",
};

/**
 * Indicator keys that map onto a numeric field of CurrencyData. Anything else
 * in IndicatorValue is ignored by the scoring engine, so an unrecognised key is
 * stored but never silently coerced onto the wrong field.
 */
const NUMERIC_FIELDS = [
  "interestRate",
  "gdpQoQ",
  "pmiManufacturing",
  "pmiServices",
  "cpi",
  "coreCpi",
  "ppi",
  "unemployment",
  "retailSales",
  "wagePPI",
  "tradeBalance",
  "currentAccount",
  "consumerConfidence",
  "nfp",
  "corePce",
  "zew",
  "ifo",
  "employmentChange",
  "commodityPrice",
  "oilPrice",
  "chinaDemand",
  "riskSentiment",
  "usSpillover",
  "tokyoCpi",
  "eurChf",
  "industrialProduction",
] as const;

type NumericField = (typeof NUMERIC_FIELDS)[number];

function isNumericField(key: string): key is NumericField {
  return (NUMERIC_FIELDS as readonly string[]).includes(key);
}

/** Fields that must always be present on CurrencyData, with a neutral default. */
const REQUIRED_DEFAULTS: Record<string, number> = {
  interestRate: 0,
  gdpQoQ: 0,
  pmiManufacturing: 50,
  pmiServices: 50,
  cpi: 0,
  coreCpi: 0,
  ppi: 0,
  unemployment: 0,
  retailSales: 0,
  wagePPI: 0,
  tradeBalance: 0,
  currentAccount: 0,
  consumerConfidence: 0,
};

interface IndicatorRow {
  currencyCode: string;
  indicatorKey: string;
  value: string | number;
  periodEnd: Date;
  nextRelease: Date | null;
  source: string;
  sourceStale: boolean;
  comment: string | null;
  rn: number;
}

/**
 * The two most recent readings of every indicator, in one query.
 *
 * Resolution is by SOURCE TIER FIRST, then by period — and that order is the
 * whole point:
 *
 *   FRED (1) > EUROSTAT (2) > FXMACRODATA (3) > MARKET (4) > ESTAT (5)
 *   > OECD (6) > DERIVED (7) > MANUAL (8)
 *
 * EUROSTAT sits above FXMacroData because it is the PUBLISHER of the euro-area
 * figures FXMacroData redistributes. Ranking the redistributor higher would
 * mean a stalled aggregator could pin an indicator to a stale value while the
 * publisher's own fresher row sat unused — which is the failure this source
 * was added to end. It touches the EUR alone; no other currency has a
 * Eurostat row, so the tier is inert everywhere else.
 *
 * MARKET is the VIX and anything else quoted continuously rather than
 * published on a calendar. It never competes with the others in practice —
 * no statistical agency publishes a `riskSentiment` — so its rank only
 * matters as a tie-break that can never fire.
 *
 * FXMacroData outranks OECD, not the other way around, and that took a real
 * refresh run to discover: OECD answers 500 for most of its five datasets
 * under normal load (its rate limiter, not an outage — see oecd.ts), so the
 * table accumulates OECD rows that are occasionally years stale (JPY's CPI
 * sat on a 2021 reading) sitting at a tier that would otherwise permanently
 * block a fresher FXMacroData row for the same indicator, no matter how
 * recent. FXMacroData carries policy rate, CPI, core CPI, GDP, unemployment
 * and trade balance for all eight currencies reliably (confirmed live), so it
 * sits second, below only FRED — which is authoritative for the USD when its
 * key is configured, and otherwise never writes at all. PMI has no
 * FXMacroData slug for any currency, so it is untouched by this and stays
 * OECD/FRED-only.
 *
 * MANUAL here is the seeded legacy baseline, not user input; a user's manual
 * correction lives in IndicatorOverride and is applied later, outside this
 * query. That baseline was reconstructed with fabricated period labels taken
 * from each currency's `lastUpdate`, which land in July 2026 — NEWER than the
 * genuine June readings the APIs actually publish. Ranking by period first
 * would therefore let the hardcoded legacy snapshot outrank live data and
 * silently freeze the scores, which is exactly the bug this app must not have.
 *
 * Only one tier is ever used per indicator. Mixing them would be worse than
 * either alone: the newest row could be a real June figure while "previous"
 * came from the fabricated July baseline, producing a momentum reading that is
 * not merely wrong but backwards.
 *
 * Within a tier, one row per period (the most recently fetched), then the two
 * newest periods — so "previous" is always a genuinely earlier reading from the
 * same provider.
 *
 * Done in SQL rather than by loading the table and reducing in JS: indicator
 * history grows by a row per indicator per month forever.
 */
async function latestIndicatorRows(): Promise<IndicatorRow[]> {
  return prisma.$queryRaw<IndicatorRow[]>`
    WITH tiered AS (
      SELECT
        v.*,
        CASE v."source"
          WHEN 'FRED' THEN 1
          WHEN 'EUROSTAT' THEN 2
          WHEN 'ECB' THEN 2
          WHEN 'FXMACRODATA' THEN 3
          WHEN 'MARKET' THEN 4
          WHEN 'ESTAT' THEN 5
          WHEN 'OECD' THEN 6
          WHEN 'DERIVED' THEN 7
          ELSE 8
        END AS tier
      FROM "IndicatorValue" v
    ),
    best AS (
      SELECT "currencyCode", "indicatorKey", MIN(tier) AS tier
      FROM tiered
      GROUP BY "currencyCode", "indicatorKey"
    ),
    in_tier AS (
      SELECT t.*
      FROM tiered t
      JOIN best b
        ON b."currencyCode" = t."currencyCode"
       AND b."indicatorKey" = t."indicatorKey"
       AND b.tier = t.tier
    ),
    deduped AS (
      SELECT
        i.*,
        ROW_NUMBER() OVER (
          PARTITION BY i."currencyCode", i."indicatorKey", i."periodEnd"
          ORDER BY i."fetchedAt" DESC
        ) AS same_period_rank
      FROM in_tier i
    )
    SELECT "currencyCode", "indicatorKey", "value", "periodEnd", "nextRelease", "source", "sourceStale", "comment", rn
    FROM (
      SELECT
        d."currencyCode",
        d."indicatorKey",
        d."value",
        d."periodEnd",
        d."nextRelease",
        d."source",
        d."sourceStale",
        d."comment",
        ROW_NUMBER() OVER (
          PARTITION BY d."currencyCode", d."indicatorKey"
          ORDER BY d."periodEnd" DESC
        ) AS rn
      FROM deduped d
      WHERE d.same_period_rank = 1
    ) ranked
    WHERE rn <= 2
  `;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Every currency with its macro data, for one user.
 *
 * Deduped per request with `cache` — the dashboard, the sidebar badge and any
 * embedded panel all want this, and it should be one round of queries.
 */
export const getCurrencies = cache(
  async (userId: string): Promise<Record<string, CurrencyData>> => {
    const [currencies, indicatorRows, overrides, notes, checkRows] = await Promise.all([
      prisma.currency.findMany({ orderBy: { sortOrder: "asc" } }),
      latestIndicatorRows(),
      prisma.indicatorOverride.findMany({ where: { userId } }),
      prisma.currencyNote.findMany({ where: { userId } }),
      prisma.indicatorCheck.findMany(),
    ]);

    const checksByCode = new Map<string, CurrencyData["checks"]>();
    for (const row of checkRows) {
      const forCurrency = checksByCode.get(row.currencyCode) ?? {};
      forCurrency[row.indicatorKey] = {
        status: row.status,
        reference: row.reference,
        checkedOn: toIsoDate(row.checkedOn),
      };
      checksByCode.set(row.currencyCode, forCurrency);
    }

    const noteByCode = new Map(notes.map((n) => [n.currencyCode, n]));
    type OverrideEntry = {
      value: number;
      previousValue: number | null;
      periodEnd: Date | null;
      nextRelease: Date | null;
    };
    const overrideByCode = new Map<string, Map<string, OverrideEntry>>();
    for (const o of overrides) {
      const forCurrency = overrideByCode.get(o.currencyCode) ?? new Map<string, OverrideEntry>();
      forCurrency.set(o.indicatorKey, {
        value: Number(o.value),
        previousValue: o.previousValue === null ? null : Number(o.previousValue),
        periodEnd: o.periodEnd,
        nextRelease: o.nextRelease,
      });
      overrideByCode.set(o.currencyCode, forCurrency);
    }

    const result: Record<string, CurrencyData> = {};

    for (const currency of currencies) {
      const note = noteByCode.get(currency.code);
      const currencyOverrides =
        overrideByCode.get(currency.code) ?? new Map<string, OverrideEntry>();

      const rows = indicatorRows.filter((r) => r.currencyCode === currency.code);
      const current = new Map<string, IndicatorRow>();
      const previous = new Map<string, IndicatorRow>();
      for (const row of rows) {
        (Number(row.rn) === 1 ? current : previous).set(row.indicatorKey, row);
      }

      const data: Record<string, unknown> = {
        code: currency.code,
        name: currency.name,
        countryCode: currency.countryCode,
        category: CATEGORY_TO_DOMAIN[currency.category],
        stance: note?.stance ? STANCE_TO_DOMAIN[note.stance] : "Neutral",
        geopoliticalRisks: note?.geopoliticalRisks ?? "",
        qualitativeAnalysis: note?.qualitativeAnalysis ?? "",
        eventsToWatch: note?.eventsToWatch ?? [],
        ...REQUIRED_DEFAULTS,
      };

      const nextReleases: Record<string, string> = {};
      const previousData: Record<string, number | string> = {};
      const dataSources: Record<string, string> = {};
      const staleFields: Record<string, boolean> = {};
      /** Publication date per indicator — the API's, or the override's when set. */
      const periods: Record<string, string> = {};
      /**
       * One French sentence explaining the current reading, when generation
       * has happened for it. Absent is the normal case for most rows — see
       * lib/commentary.ts for why it is not generated on every refresh.
       */
      const comments: Record<string, string> = {};
      let lastUpdate = "";

      for (const [key, row] of current) {
        if (!isNumericField(key)) continue;
        data[key] = Number(row.value);
        if (row.nextRelease) nextReleases[key] = toIsoDate(row.nextRelease);
        dataSources[key] = row.source;
        if (row.sourceStale) staleFields[key] = true;
        periods[key] = toIsoDate(row.periodEnd);
        if (row.comment) comments[key] = row.comment;
      }

      for (const [key, row] of previous) {
        if (!isNumericField(key)) continue;
        previousData[key] = Number(row.value);
      }

      // The override is the user's own reading of the same slot and wins over
      // whatever the API last wrote. Applied after the API values, never before.
      //
      // ITS DATE WINS TOO, when it has one. Overriding a value used to leave
      // the API's publication date beside it, so a figure entered by hand for
      // a release the API had not caught up with still displayed the older
      // period — a fresh number wearing a stale date. A null periodEnd keeps
      // the source's date, which is the right behaviour when merely correcting
      // a figure for the period the API already holds.
      for (const [key, override] of currencyOverrides) {
        if (!isNumericField(key)) continue;
        data[key] = override.value;

        // The displaced reading becomes "previous", so momentum compares the
        // correction against what it replaced. Without this the comparison
        // stayed pinned to the API's last publication — often months old — and
        // a second correction was measured against a figure two edits stale.
        if (override.previousValue !== null) previousData[key] = override.previousValue;

        if (override.periodEnd) periods[key] = toIsoDate(override.periodEnd);
        // The next release too: a provider that has no calendar for an
        // indicator, or has the wrong date for it, is exactly when someone
        // enters one by hand — and the API's silence must not win over it.
        if (override.nextRelease) nextReleases[key] = toIsoDate(override.nextRelease);
      }

      // Computed AFTER the overrides, so a hand-entered release the API has
      // not published yet moves the currency's "last updated" forward instead
      // of being invisible on the dashboard.
      for (const period of Object.values(periods)) {
        if (period > lastUpdate) lastUpdate = period;
      }

      data.periods = periods;
      data.comments = comments;
      data.lastUpdate = lastUpdate;
      data.nextReleases = nextReleases;
      data.previousData = previousData;
      data.dataSources = dataSources;
      data.staleFields = staleFields;
      data.checks = checksByCode.get(currency.code) ?? {};

      result[currency.code] = data as unknown as CurrencyData;
    }

    return result;
  },
);

/**
 * The value each indicator would have WITHOUT any manual override — i.e. what
 * the APIs currently supply.
 *
 * The admin screen shows this next to an overridden field so it is always
 * visible what a manual entry is replacing. Without it, a stale correction
 * entered months ago is indistinguishable from live data.
 */
export const getApiValues = cache(
  async (): Promise<Record<string, Record<string, number>>> => {
    const rows = await latestIndicatorRows();
    const result: Record<string, Record<string, number>> = {};

    for (const row of rows) {
      if (Number(row.rn) !== 1) continue;
      const forCurrency = (result[row.currencyCode] ??= {});
      forCurrency[row.indicatorKey] = Number(row.value);
    }

    return result;
  },
);

// ── Market context ─────────────────────────────────────────────────────────

/** camelCase domain field -> snake_case storage key. */
export function contextKeyToDb(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

const CONTEXT_NUMERIC_KEYS = Object.keys(EMPTY_MARKET_CONTEXT).filter(
  (k) => k !== "snbIntervention" && k !== "lastUpdate",
) as Array<keyof MarketContext>;

const SNB_VALUES: readonly SnbIntervention[] = ["aucune", "affaiblir_chf", "renforcer_chf"];

function isSnbIntervention(value: string): value is SnbIntervention {
  return (SNB_VALUES as readonly string[]).includes(value);
}

/**
 * The user's market context — the inputs behind every `specifique: true`
 * indicator (oil, iron ore, VIX, China PMI, ZEW, KOF, ...).
 *
 * A key with no row stays null, and the engine then drops that indicator's
 * weight from the denominator rather than scoring it zero. That distinction is
 * the single most load-bearing rule in the scoring model, so absence is
 * represented as absence here and never defaulted to a number.
 */
export const getMarketContext = cache(async (userId: string): Promise<MarketContext> => {
  const rows = await prisma.marketContextValue.findMany({
    where: { userId },
    orderBy: { observedOn: "desc" },
  });

  // Rows are dated; the newest per key wins.
  const newestByKey = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!newestByKey.has(row.key)) newestByKey.set(row.key, row);
  }

  const context: MarketContext = { ...EMPTY_MARKET_CONTEXT };

  for (const field of CONTEXT_NUMERIC_KEYS) {
    const row = newestByKey.get(contextKeyToDb(field));
    if (row?.value != null) {
      (context[field] as number | null) = Number(row.value);
    }
  }

  const snb = newestByKey.get(contextKeyToDb("snbIntervention"));
  if (snb?.textValue && isSnbIntervention(snb.textValue)) {
    context.snbIntervention = snb.textValue;
  }

  const newest = rows[0];
  context.lastUpdate = newest ? toIsoDate(newest.observedOn) : "";

  return context;
});

/**
 * Every currency, scored. This is the entry point almost every screen wants.
 *
 * Scoring stays a pure function of (currencies, context) — the same call the
 * legacy app made, with the inputs now coming from the database instead of
 * localStorage.
 */
export const getScoredCurrencies = cache(
  async (userId: string): Promise<Record<string, CurrencyWithScore>> => {
    const [currencies, context] = await Promise.all([
      getCurrencies(userId),
      getMarketContext(userId),
    ]);
    return calculateAllScores(currencies, context);
  },
);

/** Scored currencies as an array, in the seeded display order. */
export async function getScoredCurrencyList(userId: string): Promise<CurrencyWithScore[]> {
  return Object.values(await getScoredCurrencies(userId));
}
