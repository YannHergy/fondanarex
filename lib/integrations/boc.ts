import "server-only";

/**
 * Bank of Canada — the Valet API, target overnight rate.
 *
 * Statistics Canada (lib/integrations/statcan.ts) covers CPI, core CPI,
 * employment and monthly GDP for the CAD but not the policy rate — same
 * split as every other currency here: the rate has to come from the central
 * bank that sets it, not the statistics office.
 *
 * No key, no registration. Series `V39079` is "Target for the overnight
 * rate" — the policy rate the Bank of Canada itself calls its benchmark.
 *
 * Verified against Trading Economics: 2.25% as of 11 August 2026, exact match.
 */

const URL_BASE = "https://www.bankofcanada.ca/valet/observations/V39079/json";

/** Twelve hours — the Bank of Canada meets on a schedule, this is not a quote. */
const REVALIDATE = 12 * 60 * 60;

const HISTORY_SINCE = "2015-01-01";

export interface BocPoint {
  /** "2026-08-11" — business-daily, flat between rate decisions. */
  period: string;
  value: number;
}

export interface BocSeriesResult {
  field: "interestRate";
  label: string;
  displayUnit: string;
  context: string | null;
  history: BocPoint[];
  error: string | null;
}

const CONTEXT =
  "Le taux cible du financement à un jour est le taux directeur de la Banque du Canada : chacune de ses huit décisions annuelles déplace directement l'attractivité du dollar canadien.";

interface BocObservation {
  d: string;
  V39079?: { v: string };
}
interface BocResponse {
  observations?: BocObservation[];
}

export async function fetchBocData(): Promise<BocSeriesResult[]> {
  const base = {
    field: "interestRate" as const,
    label: "Taux directeur (cible du financement à un jour)",
    displayUnit: "%",
    context: CONTEXT,
  };

  const url = new URL(URL_BASE);
  url.searchParams.set("start_date", HISTORY_SINCE);

  try {
    const response = await fetch(url, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return [{ ...base, history: [], error: `BoC ${response.status}` }];
    }

    const payload = (await response.json()) as BocResponse;
    const history = (payload.observations ?? [])
      .map((obs) => {
        const raw = obs.V39079?.v;
        if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(obs.d)) return null;
        const value = Number(raw);
        return Number.isFinite(value) ? { period: obs.d, value } : null;
      })
      .filter((p): p is BocPoint => p !== null && p.value > -1 && p.value < 20)
      .sort((a, b) => (a.period < b.period ? -1 : 1));

    if (history.length === 0) {
      return [{ ...base, history: [], error: "Aucune valeur exploitable (format Valet probablement changé)" }];
    }

    return [{ ...base, history, error: null }];
  } catch (error) {
    return [{ ...base, history: [], error: error instanceof Error ? error.message : String(error) }];
  }
}

/** True when the BoC is the source wired for this field (CAD's policy rate only). */
export function hasBocHistory(field: string): boolean {
  return field === "interestRate";
}

/** Full history for the CAD policy rate, straight from the BoC — used by the indicator detail page's chart. */
export async function getBocHistory(field: string): Promise<BocSeriesResult | null> {
  if (!hasBocHistory(field)) return null;
  const [result] = await fetchBocData();
  return result ?? null;
}
