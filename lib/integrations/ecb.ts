import "server-only";

import {
  isPlausiblePolicyRate,
  latestEcbPoint,
  parseEcbSdmx,
  type EcbPoint,
  type EcbSdmxResponse,
} from "@/domain/macro/ecb";

/**
 * ECB Data Portal — the European Central Bank's own policy-rate series.
 *
 * No key, no registration. Eurostat (the euro area's statistical office)
 * does NOT publish the ECB's own policy rate — verified live: its money-market
 * table (`irt_st_m`) only carries interbank rates (day-to-day, 1/3/6/12-month),
 * never the rate the ECB itself sets. The rate has to come from the ECB.
 *
 * The legacy `sdw-wsrest.ecb.europa.eu` host is GONE — the ECB migrated to a
 * new Data Portal two years ago and stopped redirecting the old host on
 * 2025-10-01. `data-api.ecb.europa.eu` is the live replacement.
 *
 * THE DEPOSIT FACILITY RATE (DFR), NOT THE MAIN REFINANCING RATE (MRR), IS
 * THE ACTUAL POLICY RATE since the ECB's September 2024 operational
 * framework reform. The banking system runs a structural liquidity surplus,
 * so banks park cash at the ECB rather than borrow from it — the €STR
 * (the real market rate) tracks the DFR, not the MRR. Verified against our
 * own stored value: DFR gave 2.25% for 2026-06-17, matching exactly what
 * FXMacroData and the manual entry already had; MRR gave 2.4% for the same
 * date, a different and now largely unused ceiling rate.
 */

const BASE = "https://data-api.ecb.europa.eu/service/data";

/** Twelve hours. Policy decisions happen at scheduled meetings, not continuously. */
const REVALIDATE = 12 * 60 * 60;

/**
 * Same anchor as Eurostat's HISTORY_SINCE (see eurostat.ts) — one common
 * start date for the chart's full history instead of the old 3Y/5Y/10Y
 * buttons that all sliced the same short upstream window.
 */
const HISTORY_SINCE = "2023-01-01";

export class EcbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EcbError";
  }
}

export interface EcbSeriesResult {
  field: "interestRate";
  label: string;
  displayUnit: string;
  context: string | null;
  latest: EcbPoint | null;
  /** Full history, oldest first. Daily points, flat between decisions. */
  history: EcbPoint[];
  error: string | null;
}

const CONTEXT =
  "Depuis la réforme du cadre opérationnel de la BCE (septembre 2024), le taux de facilité de dépôt est devenu le taux directeur de référence : le système bancaire étant structurellement excédentaire en liquidités, c'est ce taux — auquel les banques placent leurs excédents — qui pilote les taux du marché monétaire, plutôt que le taux de refinancement principal.";

/**
 * The FM dataflow, deposit facility rate, fixed-rate level series —
 * `FM.D.U2.EUR.4F.KR.DFR.LEV`. Confirmed live: daily frequency, one point per
 * day, flat between decisions (a genuine step series, not a gap-filled one).
 */
async function fetchDfr(): Promise<EcbSeriesResult> {
  const base = {
    field: "interestRate" as const,
    label: "Taux de facilité de dépôt (BCE)",
    displayUnit: "%",
    context: CONTEXT,
  };

  const url = new URL(`${BASE}/FM/D.U2.EUR.4F.KR.DFR.LEV`);
  url.searchParams.set("format", "jsondata");
  url.searchParams.set("startPeriod", HISTORY_SINCE);

  try {
    const response = await fetch(url, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return { ...base, latest: null, history: [], error: `BCE ${response.status}` };
    }

    const payload = (await response.json()) as EcbSdmxResponse;
    const history = parseEcbSdmx(payload).filter((point) => isPlausiblePolicyRate(point.value));

    if (history.length === 0) {
      return {
        ...base,
        latest: null,
        history: [],
        error: "Aucune valeur publiée par la BCE (structure de réponse probablement invalide)",
      };
    }

    return { ...base, latest: latestEcbPoint(history), history, error: null };
  } catch (error) {
    return {
      ...base,
      latest: null,
      history: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** The single ECB series this app sources — kept as an array for symmetry with fetchEurostatData. */
export async function fetchEcbData(): Promise<EcbSeriesResult[]> {
  return [await fetchDfr()];
}

/** True when the ECB is the source wired for this field (EUR's policy rate only, for now). */
export function hasEcbHistory(field: string): boolean {
  return field === "interestRate";
}

/** Full history for the EUR policy rate, straight from the ECB — used by the indicator detail page's chart. */
export async function getEcbHistory(field: string): Promise<EcbSeriesResult | null> {
  if (!hasEcbHistory(field)) return null;
  return fetchDfr();
}
