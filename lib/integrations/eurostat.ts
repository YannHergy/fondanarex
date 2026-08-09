import "server-only";

import {
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
}

/**
 * The four euro-area indicators Eurostat covers well.
 *
 * Each `params` set was confirmed against the live API to return real numbers;
 * a wrong unit code is the difference between a 2.0% inflation rate and a
 * 139-point index, and the API reports neither as an error.
 */
const SERIES: readonly SeriesConfig[] = [
  {
    field: "cpi",
    label: "Inflation (IPCH)",
    dataset: "prc_hicp_manr",
    // RCH_A is the annual rate of change. Without it the dataset also carries
    // index levels, which would score as runaway inflation.
    params: { geo: "EA", coicop: "CP00", unit: "RCH_A" },
  },
  {
    field: "coreCpi",
    label: "Inflation sous-jacente (IPCH hors énergie/alimentation)",
    dataset: "prc_hicp_manr",
    params: { geo: "EA", coicop: "TOT_X_NRG_FOOD", unit: "RCH_A" },
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
    const history = parseJsonStat(payload).filter((point) => isPlausibleRate(point.value));

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
