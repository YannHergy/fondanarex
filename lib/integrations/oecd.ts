import "server-only";

import {
  parseSdmxSeries,
  toCurrencyDatapoints,
  type SdmxDatapoint,
} from "@/domain/macro/sdmx";

/**
 * OECD Data Explorer.
 *
 * The legacy app reached this through a Vercel function whose only job was to
 * dodge CORS — a browser cannot call the OECD directly. Server components have
 * no such constraint, so the request is made here and the proxy is gone.
 *
 * Two OECD APIs are in play. Everything uses the current SDMX-JSON 2.0 service,
 * except the trade balance, which was never migrated and is still only
 * available from the legacy 1.x endpoint. The parser handles both shapes.
 */

const OECD_V2 = "https://sdmx.oecd.org/public/rest/data";
const OECD_V1 = "https://stats.oecd.org/sdmx-json/data";

/** The eight tracked economies, as OECD reference areas. EA20 is the euro area. */
const AREAS = "AUS+CAN+GBR+NZL+JPN+CHE+EA20+USA";

/** The national-accounts dataflow spells the euro area `EA`, not `EA20`. */
const AREAS_NA = "AUS+CAN+GBR+NZL+JPN+CHE+EA+USA";

/**
 * Without this the OECD returns its "series" layout, where the dimensions live
 * under `dimensions.series` and the data under `dataSets[0].series`. The parser
 * reads the flat layout, so omitting this yields a 200 response that decodes to
 * nothing at all — a silent no-op rather than an error.
 */
const FLAT = "dimensionAtObservation=AllDimensions";

interface DatasetConfig {
  /** Field on CurrencyData this dataset feeds. */
  field: string;
  label: string;
  url: string;
  /** Scales the raw value, e.g. 1000 to turn millions into billions. */
  divisor?: number;
}

/**
 * SDMX keys are POSITIONAL: every dimension of the dataflow must appear, in
 * order, or the request fails with 422. The keys below were derived by reading
 * each dataflow's actual dimension list, not by guessing.
 *
 * Every dimension that can vary is pinned explicitly. This is the difference
 * between a correct figure and a plausible-looking wrong one: the price
 * dataflow, queried with EXPENDITURE left open, returns 29 sub-indices per
 * country (food, health, fuels, ...) and the parser would have taken whichever
 * arrived first as "the CPI". The `collisions` count from the parser is the
 * backstop — a non-zero value means a key has come unpinned.
 *
 * The legacy app's keys are all stale: they were one dimension short (the OECD
 * has since added dimensions), assumed FREQ was always dimension 2 (it is
 * dimension 9 in the labour dataflow), and omitted the flat-layout parameter.
 */
export const OECD_DATASETS: readonly DatasetConfig[] = [
  {
    field: "cpi",
    label: "Inflation (CPI)",
    // REF_AREA.FREQ.METHODOLOGY.MEASURE.UNIT_MEASURE.EXPENDITURE.ADJUSTMENT.TRANSFORMATION
    // N = national methodology, _T = all items, GY = year-on-year growth.
    url: `${OECD_V2}/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL/${AREAS}.M.N.CPI.._T..GY?format=jsondata&lastNObservations=7&${FLAT}`,
  },
  {
    field: "coreCpi",
    label: "Inflation sous-jacente",
    // Same dataflow; _TXCP01_NRG = all items excluding food and energy.
    url: `${OECD_V2}/OECD.SDD.TPS,DSD_PRICES@DF_PRICES_ALL/${AREAS}.M.N.CPI.._TXCP01_NRG..GY?format=jsondata&lastNObservations=7&${FLAT}`,
  },
  {
    field: "unemployment",
    label: "Chômage",
    // REF_AREA.MEASURE.UNIT_MEASURE.TRANSFORMATION.ADJUSTMENT.SEX.AGE.ACTIVITY.FREQ
    // Note FREQ is the LAST dimension here, not the second.
    // Y = seasonally adjusted, _T = both sexes, Y_GE15 = aged 15 and over.
    url: `${OECD_V2}/OECD.SDD.TPS,DSD_LFS@DF_IALFS_UNE_M/${AREAS}.UNE_LF_M.PT_LF_SUB._Z.Y._T.Y_GE15._Z.M?format=jsondata&lastNObservations=7&${FLAT}`,
  },
  {
    field: "interestRate",
    label: "Taux 3 mois",
    // REF_AREA.FREQ.MEASURE.UNIT_MEASURE.ACTIVITY.ADJUSTMENT.TRANSFORMATION
    // IR3TIB = 3-month interbank rate, PA = per annum.
    //
    // This is a MARKET rate, not the policy rate. It tracks the policy rate
    // closely and is the only rate the OECD publishes monthly for all eight,
    // but it is a proxy. The USD is overwritten by FRED's FEDFUNDS, which is
    // the actual policy rate, and FRED outranks OECD on read.
    url: `${OECD_V2}/OECD.SDD.STES,DSD_KEI@DF_KEI/${AREAS}.M.IR3TIB.PA._Z._Z._Z?format=jsondata&lastNObservations=7&${FLAT}`,
  },
  {
    field: "gdpQoQ",
    label: "PIB trimestriel",
    // FREQ.ADJUSTMENT.REF_AREA.SECTOR.COUNTERPART_SECTOR.TRANSACTION.INSTR_ASSET
    //   .ACTIVITY.EXPENDITURE.UNIT_MEASURE.PRICE_BASE.TRANSFORMATION.TABLE_IDENTIFIER
    // REF_AREA is the THIRD dimension in this dataflow, and the euro area is
    // spelled EA. B1GQ = GDP, L = chained volume, G1 = growth on previous period.
    url: `${OECD_V2}/OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH_OECD/Q.Y.${AREAS_NA}.S1.S1.B1GQ._Z._Z._Z.PC.L.G1.T0102?format=jsondata&lastNObservations=7&${FLAT}`,
  },
];

/**
 * Trade balance is deliberately absent.
 *
 * It only ever existed on the legacy stats.oecd.org 1.x endpoint, which now
 * returns 404 — that service has been retired. FRED supplies it for the USD;
 * for the other seven currencies the indicator simply has no data, and the
 * scoring engine excludes it and removes its weight from the denominator. That
 * is the correct outcome: a missing series must not become a zero.
 */
void OECD_V1;

export interface OecdDatasetResult {
  field: string;
  label: string;
  /** Currency code -> reading. Empty when the dataset returned nothing usable. */
  values: Record<string, SdmxDatapoint>;
  error: string | null;
}

/**
 * Fetches one dataset.
 *
 * A 12-hour revalidation window matches how this data actually behaves: OECD
 * series are monthly or quarterly, so polling faster cannot surface anything
 * new — the publication schedule, not the poll rate, is what limits freshness.
 */
async function fetchDataset(config: DatasetConfig, attempt = 1): Promise<OecdDatasetResult> {
  const base = { field: config.field, label: config.label };
  // One retry only. More attempts against a rate limiter make the throttling
  // worse, and the run has a wall-clock budget to respect.
  const MAX_ATTEMPTS = 2;

  try {
    const response = await fetch(config.url, {
      // `Accept: */*` is REQUIRED, not incidental.
      //
      // The OECD content-negotiates on Accept, and sending the obvious
      // `application/json` makes it answer 500 Internal Server Error — as does
      // the correct-looking `application/vnd.sdmx.data+json`. Only `*/*` (or no
      // Accept header at all) succeeds; the response format is already selected
      // by `format=jsondata` in the query string.
      //
      // This is why the failure looked like a bad query for so long: curl
      // defaults to `*/*` and worked, while every request from the app sent
      // `application/json` and got a 500 that pointed nowhere near the cause.
      headers: { Accept: "*/*", "User-Agent": "Fondanarex/1.0" },
      next: { revalidate: 12 * 60 * 60 },
      signal: AbortSignal.timeout(30_000),
    });

    // The OECD returns 5xx under concurrent load, and 429 when it decides you
    // are asking too often. Both are transient, so retry with backoff rather
    // than reporting the dataset as unavailable for the next 12 hours.
    if ((response.status >= 500 || response.status === 429) && attempt < MAX_ATTEMPTS) {
      // Exponential-ish backoff. The OECD throttles aggressively and answers
      // both 429 and a bare 500 when it does, so a short retry just burns the
      // remaining budget.
      await delay(attempt * 6_000);
      return fetchDataset(config, attempt + 1);
    }

    if (!response.ok) {
      return { ...base, values: {}, error: `OECD ${response.status} ${response.statusText}` };
    }

    const json: unknown = await response.json();
    const parsed = parseSdmxSeries(json, config.divisor ?? 1);

    // A collision means the query key left a dimension open and more than one
    // series landed on the same country and period. Refusing the dataset is the
    // only safe response: taking the first match would write a number that
    // looks like the indicator but is not it.
    if (parsed.collisions > 0) {
      return {
        ...base,
        values: {},
        error: `Clé OECD ambiguë : ${parsed.collisions} collisions — dimension non filtrée`,
      };
    }

    const values = toCurrencyDatapoints(parsed.values);

    if (Object.keys(values).length === 0) {
      return { ...base, values: {}, error: "Réponse OECD vide ou non exploitable" };
    }

    return { ...base, values, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (attempt < MAX_ATTEMPTS) {
      await delay(attempt * 1_500);
      return fetchDataset(config, attempt + 1);
    }
    return { ...base, values: {}, error: message };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches every dataset, ONE AT A TIME.
 *
 * Sequential on purpose. Issuing the five requests concurrently makes the OECD
 * answer 500 for most of them — the same URLs succeed when spaced out. That
 * failure is easy to misread as a bad query, because a parallel run returns
 * "500 Internal Server Error" for every dataset at once while each one works
 * perfectly on its own.
 *
 * The cost is a slower refresh (roughly fifteen seconds rather than three),
 * which is irrelevant for a job that runs on a schedule against data published
 * monthly.
 *
 * One failing dataset never discards the others: each result carries its own
 * error, so the caller can report exactly what is stale.
 */
export async function fetchAllOecdData(fields?: readonly string[]): Promise<OecdDatasetResult[]> {
  const selected = fields?.length
    ? OECD_DATASETS.filter((d) => fields.includes(d.field))
    : OECD_DATASETS;

  const results: OecdDatasetResult[] = [];

  for (const [index, config] of selected.entries()) {
    // Space the requests out. The OECD's rate limit is tight enough that five
    // requests inside ten seconds trips it even when issued one at a time —
    // and it signals the trip with a bare 500 as often as a 429, which reads
    // like a broken query rather than throttling.
    if (index > 0) await delay(6_000);
    results.push(await fetchDataset(config));
  }

  return results;
}

/** Dataset field names, for the cron scheduler to walk one at a time. */
export const OECD_FIELDS: readonly string[] = OECD_DATASETS.map((d) => d.field);

export function isConfigured(): boolean {
  // The OECD API needs no key — it is the one source that always works.
  return true;
}
