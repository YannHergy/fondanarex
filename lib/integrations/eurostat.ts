import "server-only";

import {
  isPlausibleBalance,
  isPlausibleRate,
  latestPoint,
  parseJsonStat,
  type EurostatPoint,
  type JsonStatResponse,
} from "@/domain/macro/eurostat";

/**
 * Eurostat — the euro area's own statistical office.
 *
 * No key, no registration, no rate limit published. This is the primary source
 * for the EUR: FXMacroData redistributes these same figures, and its refresh
 * had stopped moving them, so going to the publisher removes a hop that could
 * silently freeze.
 *
 * THE GEO CODE IS NOT THE SAME ACROSS DATASETS, and that cost real debugging
 * time. `une_rt_m` only carries `EA21` (the euro area as of 2026, after
 * enlargement) while `prc_hicp_manr` and `namq_10_gdp` still carry `EA`,
 * `EA20` and `EA19`. Querying `EA20` against unemployment returns HTTP 200
 * with a `geo` dimension of size zero and an empty value object — a silent
 * no-op that looks exactly like "not published yet". Each series therefore
 * pins the code that was verified live against it.
 */

const BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";

/** Twelve hours. These are monthly and quarterly releases, not quotes. */
const REVALIDATE = 12 * 60 * 60;

export class EurostatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EurostatError";
  }
}

interface SeriesConfig {
  /** Field on CurrencyData this series feeds. */
  field: string;
  label: string;
  dataset: string;
  /** Dimension filters, verified live — see the note on geo codes above. */
  params: Record<string, string>;
  /**
   * Divides the raw value before anything else sees it. Eurostat serves the
   * trade balance in millions; the scoring engine's thresholds (±15, ±5) are
   * written for billions, the same convention FXMacroData's own `/ 1000`
   * already used. Defaults to 1 — the three percentage series need no scaling.
   */
  scale?: number;
  /**
   * Plausibility check, run AFTER scaling. Defaults to `isPlausibleRate`,
   * which is wrong for a monetary aggregate: the trade balance passes
   * `isPlausibleBalance` instead, its own bound in billions rather than
   * percentage points.
   */
  validate?: (value: number) => boolean;
}

/**
 * The four euro-area indicators Eurostat covers well.
 *
 * Each `params` set was confirmed against the live API to return real numbers;
 * a wrong unit code is the difference between a 2.0% inflation rate and a
 * 139-point index, and the API reports neither as an error.
 */
const SERIES: readonly SeriesConfig[] = [
  // ── Inflation: ei_cphi_m, NOT prc_hicp_manr ─────────────────────────────
  //
  // Both publish the euro-area HICP annual rate and they do NOT stay in step.
  // `prc_hicp_manr` is the reference database, revised and republished on a
  // long cycle; it stopped at December 2025 while the euro area had already
  // printed July 2026. `ei_cphi_m` is the short-term indicators table, which
  // carries the flash estimate — the number the market actually trades and the
  // one Trading Economics shows against an "Source: EUROSTAT" credit.
  //
  // Taking the reference database made the dashboard read 2.0% when inflation
  // was 2.9%: not stale by a rounding error but by seven months and a full
  // percentage point, at a moment when energy was reflating hard. Verified
  // against the published series: 2026-05 3.2, 2026-06 2.8, 2026-07 2.9.
  //
  // `unit=RT12` is the twelve-month growth rate. The same table also offers
  // RT1 (month on month) and an index level, either of which would be scored
  // as an inflation rate and be badly wrong.
  {
    field: "cpi",
    label: "Inflation (IPCH)",
    dataset: "ei_cphi_m",
    params: { geo: "EA", unit: "RT12", indic: "TOTAL" },
  },
  {
    field: "coreCpi",
    label: "Inflation sous-jacente (IPCH hors énergie/alimentation)",
    dataset: "ei_cphi_m",
    // Excludes energy, food, alcohol and tobacco — the ECB's own core measure,
    // and what "core" means on every other currency in this app.
    params: { geo: "EA", unit: "RT12", indic: "CP-HI00XEF" },
  },
  {
    field: "gdpQoQ",
    label: "PIB trimestriel",
    dataset: "namq_10_gdp",
    // Chain-linked volumes, percentage change on the PREVIOUS PERIOD — which
    // is what `gdpQoQ` means. The same dataset also publishes year-on-year and
    // absolute levels under different unit codes.
    params: { geo: "EA", unit: "CLV_PCH_PRE", s_adj: "SCA", na_item: "B1GQ" },
  },
  {
    field: "unemployment",
    label: "Chômage",
    dataset: "une_rt_m",
    // EA21, not EA20 — this dataset carries no other euro-area aggregate.
    params: { geo: "EA21", unit: "PC_ACT", s_adj: "SA", age: "TOTAL", sex: "T" },
  },
  // ── Trade balance: ext_st_easitc, found by matching a published headline ──
  //
  // Two OTHER Eurostat tables were tried first and both were wrong, discovered
  // only because a reader compared the dashboard against a published figure.
  // `ei_bpm6ca_m` (balance of payments, goods) stayed positive every month of
  // 2025–2026 in the tens of billions — a genuinely different concept, not a
  // stale or misfiltered version of the right one. `ei_eteu27_2020_m` (short-
  // term indicators) answered with real numbers too, just two orders of
  // magnitude too small (hundreds of millions, not tens of billions) — its
  // BAL_RT is scoped to a narrower flow, not total extra-area trade.
  //
  // `ext_st_easitc` — "Euro area trade by SITC product group" — is the right
  // one. Confirmed against a published headline citing EA exports €243.6bn
  // and imports €251.4bn for May 2026: `indic_et=TRD_VAL` (raw trade value,
  // not `TRD_VAL_SCA`) gives EXP=243624.1 and IMP=251400.3 for exactly that
  // month, matching to the hundred thousand. `stk_flow=BAL_RT` on the same
  // filter gives -7776.2 for May and -1247.8 for April — the precise pair the
  // headline reported, to the tenth.
  //
  // NSA over SCA is a deliberate reading of that match, not a guess: the
  // seasonally adjusted variant gave -4969.9 for the same May, which is a
  // real number from a real series but not the one anyone was quoting.
  //
  // `geo=EA21` is the only reporter this dataset carries (no EA/EA20 alias),
  // and its matching partner is `EXT_EA21`, not `EXT_EA20` — the newest
  // instance yet of the geo-code trap documented above.
  {
    field: "tradeBalance",
    label: "Balance commerciale",
    dataset: "ext_st_easitc",
    params: {
      geo: "EA21",
      partner: "EXT_EA21",
      sitc06: "TOTAL",
      stk_flow: "BAL_RT",
      indic_et: "TRD_VAL",
    },
    scale: 1000,
    validate: isPlausibleBalance,
  },
];

export interface EurostatSeriesResult {
  field: string;
  label: string;
  /** The most recent published reading, or null when the series came back empty. */
  latest: EurostatPoint | null;
  /** Full history, oldest first — used to backfill the score curve. */
  history: EurostatPoint[];
  error: string | null;
}

async function fetchSeries(config: SeriesConfig): Promise<EurostatSeriesResult> {
  const base = { field: config.field, label: config.label };

  const url = new URL(`${BASE}/${config.dataset}`);
  url.searchParams.set("format", "JSON");
  for (const [key, value] of Object.entries(config.params)) {
    url.searchParams.set(key, value);
  }

  try {
    const response = await fetch(url, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return { ...base, latest: null, history: [], error: `Eurostat ${response.status}` };
    }

    const payload = (await response.json()) as JsonStatResponse;
    const scale = config.scale ?? 1;
    const validate = config.validate ?? isPlausibleRate;

    const history = parseJsonStat(payload)
      .map((point) => ({ ...point, value: point.value / scale }))
      .filter((point) => validate(point.value));

    if (history.length === 0) {
      // A 200 with nothing in it is the signature of a wrong dimension code,
      // not of an outage — worth saying so rather than reporting success.
      return {
        ...base,
        latest: null,
        history: [],
        error: "Aucune valeur publiée (code de dimension probablement invalide)",
      };
    }

    return { ...base, latest: latestPoint(history), history, error: null };
  } catch (error) {
    return {
      ...base,
      latest: null,
      history: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Every euro-area series, fetched together.
 *
 * Four requests in parallel: they are independent, and Eurostat has no
 * published rate limit that four concurrent reads would trouble. A series that
 * fails carries its own error and the others still return.
 */
export async function fetchEurostatData(): Promise<EurostatSeriesResult[]> {
  return Promise.all(SERIES.map(fetchSeries));
}
