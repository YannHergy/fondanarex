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
  "chinaDemand",
  "riskSentiment",
  "usSpillover",
  "tokyoCpi",
  "eurChf",
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
  rn: number;
}

/**
 * The two most recent readings of every indicator, in one query.
 *
 * ROW_NUMBER rather than fetching the table and reducing in JS: indicator
 * history grows by a row per indicator per month forever, and "load everything
 * then keep two" degrades quietly as the table fills.
 */
async function latestIndicatorRows(): Promise<IndicatorRow[]> {
  return prisma.$queryRaw<IndicatorRow[]>`
    SELECT "currencyCode", "indicatorKey", "value", "periodEnd", "nextRelease", rn
    FROM (
      SELECT
        v."currencyCode",
        v."indicatorKey",
        v."value",
        v."periodEnd",
        v."nextRelease",
        ROW_NUMBER() OVER (
          PARTITION BY v."currencyCode", v."indicatorKey"
          ORDER BY v."periodEnd" DESC, v."fetchedAt" DESC
        ) AS rn
      FROM "IndicatorValue" v
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
    const [currencies, indicatorRows, overrides, notes] = await Promise.all([
      prisma.currency.findMany({ orderBy: { sortOrder: "asc" } }),
      latestIndicatorRows(),
      prisma.indicatorOverride.findMany({ where: { userId } }),
      prisma.currencyNote.findMany({ where: { userId } }),
    ]);

    const noteByCode = new Map(notes.map((n) => [n.currencyCode, n]));
    const overrideByCode = new Map<string, Map<string, number>>();
    for (const o of overrides) {
      const forCurrency = overrideByCode.get(o.currencyCode) ?? new Map<string, number>();
      forCurrency.set(o.indicatorKey, Number(o.value));
      overrideByCode.set(o.currencyCode, forCurrency);
    }

    const result: Record<string, CurrencyData> = {};

    for (const currency of currencies) {
      const note = noteByCode.get(currency.code);
      const currencyOverrides = overrideByCode.get(currency.code) ?? new Map<string, number>();

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
      let lastUpdate = "";

      for (const [key, row] of current) {
        if (!isNumericField(key)) continue;
        data[key] = Number(row.value);
        if (row.nextRelease) nextReleases[key] = toIsoDate(row.nextRelease);
        const periodEnd = toIsoDate(row.periodEnd);
        if (periodEnd > lastUpdate) lastUpdate = periodEnd;
      }

      for (const [key, row] of previous) {
        if (!isNumericField(key)) continue;
        previousData[key] = Number(row.value);
      }

      // The override is the user's own reading of the same slot and wins over
      // whatever the API last wrote. Applied after the API values, never before.
      for (const [key, value] of currencyOverrides) {
        if (isNumericField(key)) data[key] = value;
      }

      data.lastUpdate = lastUpdate;
      data.nextReleases = nextReleases;
      data.previousData = previousData;

      result[currency.code] = data as unknown as CurrencyData;
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
