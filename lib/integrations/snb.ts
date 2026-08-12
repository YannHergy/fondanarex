import "server-only";

/**
 * SNB data portal — Swiss inflation.
 *
 * Same host and same shape as the ECB's policy-rate feed is for the euro:
 * no key, no registration. The Swiss CPI is the ONLY macro indicator in the
 * CHF profile — the rest of the franc's score is the policy rate, the EUR/CHF
 * cross, SNB intervention and risk sentiment — so this one series is 16% of
 * it on its own.
 *
 * FRED carries a Swiss CPI too, and it is dead: its OECD feed stopped in
 * April 2025 while returning HTTP 200 the whole time.
 *
 * The `plkopr` cube serves two series and the SECOND is the one wanted — the
 * first is the index level (Dec 2025 = 100), the second the year-on-year
 * rate. Verified against the published figure: 0.45% for June 2026, printed
 * as 0.5%.
 */

const URL_CUBE = "https://data.snb.ch/api/cube/plkopr/data/json/en";

/** Twelve hours — a monthly release, not a quote. */
const REVALIDATE = 12 * 60 * 60;

/** Anchored like the other sources; a decade is more than anything reads. */
const HISTORY_SINCE = "2015";

export interface SnbPoint {
  /** "2026-06" */
  period: string;
  value: number;
}

export interface SnbCpiResult {
  label: string;
  displayUnit: string;
  context: string | null;
  history: SnbPoint[];
  error: string | null;
}

interface SnbCube {
  timeseries?: Array<{
    header?: Array<{ dimItem?: string }>;
    values?: Array<{ date?: string; value?: number | null }>;
  }>;
}

const CONTEXT =
  "La BNS vise une inflation entre 0% et 2% : la Suisse vit durablement dans le bas de cette fourchette, et une inflation qui approche de zéro ravive la pression pour affaiblir le franc.";

/** Picks the year-on-year series rather than the index level. */
function isYearOnYear(header: Array<{ dimItem?: string }> | undefined): boolean {
  return (header ?? []).some((h) => /corresponding month of the previous year/i.test(h.dimItem ?? ""));
}

/** True when the SNB is the source wired for this CHF field. */
export function hasSnbHistory(field: string): boolean {
  return field === "cpi";
}

export async function fetchSnbCpi(): Promise<SnbCpiResult> {
  const base = {
    label: "Inflation (IPC)",
    displayUnit: "%",
    context: CONTEXT,
  };

  try {
    const response = await fetch(URL_CUBE, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return { ...base, history: [], error: `BNS ${response.status}` };
    }

    const payload = (await response.json()) as SnbCube;
    const series = (payload.timeseries ?? []).find((s) => isYearOnYear(s.header));

    if (!series) {
      // The cube answered but without the rate series — a shape change, not an
      // outage, and worth saying so rather than reporting "no data".
      return {
        ...base,
        history: [],
        error: "Série de variation annuelle absente du cube BNS",
      };
    }

    const history = (series.values ?? [])
      .map((v) => ({ period: (v.date ?? "").trim(), value: Number(v.value) }))
      .filter(
        (p) =>
          /^\d{4}-\d{2}$/.test(p.period) &&
          p.period >= HISTORY_SINCE &&
          Number.isFinite(p.value) &&
          // Swiss inflation has never left this band; outside it means the
          // index level was picked up instead of the rate.
          p.value > -20 &&
          p.value < 20,
      )
      .sort((a, b) => (a.period < b.period ? -1 : 1));

    if (history.length === 0) {
      return { ...base, history: [], error: "Aucune valeur exploitable" };
    }

    return { ...base, history, error: null };
  } catch (error) {
    return {
      ...base,
      history: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
