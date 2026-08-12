import "server-only";

/**
 * EUR/CHF exchange rate — Frankfurter, a free key-free mirror of the ECB's
 * own daily reference rates.
 *
 * The CHF profile's second-largest weight (20%) is capital flows into the
 * franc, read off the MOVE in EUR/CHF: a DROP means the franc is
 * strengthening (inbound flows, the SNB's classic "safe-haven" problem),
 * which is why the engine scores it with a negative sign — see
 * scoreEurChfFlows / the 'eurchf' case in domain/scoring/engine.ts. Nothing
 * published this as a ready-made "% change" statistic, so it is derived here
 * from the daily LEVEL — the one arithmetic this app does itself, because
 * there is no publisher to ask instead.
 *
 * Filed under the MARKET source, the same tier as the VIX and oil: this is a
 * continuously-quoted rate, not a scheduled statistical release.
 */

const BASE = "https://api.frankfurter.dev/v1";

/** Six hours — a market rate, checked more often than a monthly release. */
const REVALIDATE = 6 * 60 * 60;

const HISTORY_SINCE = "2015-01-01";

export interface EurChfPoint {
  /** "2026-07" */
  period: string;
  value: number;
}

export interface EurChfSeriesResult {
  field: "eurChf";
  label: string;
  displayUnit: string;
  context: string | null;
  history: EurChfPoint[];
  error: string | null;
}

const CONTEXT =
  "Le CHF est la devise refuge par excellence : une baisse du taux EUR/CHF signale des flux entrants vers le franc, typiquement en période de tension sur la zone euro — ce que la BNS cherche activement à contrer.";

interface FrankfurterResponse {
  rates?: Record<string, { CHF?: number }>;
}

/** Last trading day's rate of each month, oldest first. */
function monthEndLevels(rates: Record<string, { CHF?: number }>): Array<{ period: string; value: number }> {
  const byMonth = new Map<string, { date: string; value: number }>();
  for (const [date, entry] of Object.entries(rates)) {
    const value = entry.CHF;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const month = date.slice(0, 7);
    const existing = byMonth.get(month);
    if (!existing || date > existing.date) byMonth.set(month, { date, value });
  }
  return [...byMonth.entries()]
    .map(([period, v]) => ({ period, value: v.value }))
    .sort((a, b) => (a.period < b.period ? -1 : 1));
}

export async function fetchEurChfData(): Promise<EurChfSeriesResult[]> {
  const base = {
    field: "eurChf" as const,
    label: "EUR/CHF (variation mensuelle)",
    displayUnit: "%",
    context: CONTEXT,
  };

  const url = `${BASE}/${HISTORY_SINCE}..?base=EUR&symbols=CHF`;

  try {
    const response = await fetch(url, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return [{ ...base, history: [], error: `Frankfurter ${response.status}` }];
    }

    const payload = (await response.json()) as FrankfurterResponse;
    const levels = monthEndLevels(payload.rates ?? {});

    if (levels.length < 2) {
      return [{ ...base, history: [], error: "Historique EUR/CHF insuffisant" }];
    }

    // Month-over-month % change — the one figure nobody publishes directly.
    const history: EurChfPoint[] = [];
    for (let i = 1; i < levels.length; i += 1) {
      const prev = levels[i - 1]!.value;
      const curr = levels[i]!.value;
      if (prev === 0) continue;
      const changePct = ((curr - prev) / prev) * 100;
      if (Number.isFinite(changePct) && Math.abs(changePct) < 25) {
        history.push({ period: levels[i]!.period, value: changePct });
      }
    }

    if (history.length === 0) {
      return [{ ...base, history: [], error: "Aucune variation exploitable" }];
    }

    return [{ ...base, history, error: null }];
  } catch (error) {
    return [{ ...base, history: [], error: error instanceof Error ? error.message : String(error) }];
  }
}

/** True when this is the source wired for this field (CHF's EUR/CHF flow only). */
export function hasEurChfHistory(field: string): boolean {
  return field === "eurChf";
}

/** Full history for EUR/CHF's monthly move — used by the indicator detail page's chart. */
export async function getEurChfHistory(field: string): Promise<EurChfSeriesResult | null> {
  if (!hasEurChfHistory(field)) return null;
  const [result] = await fetchEurChfData();
  return result ?? null;
}
