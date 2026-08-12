import "server-only";

/**
 * Stats NZ — the New Zealand consumer price index.
 *
 * THE ONLY WAY IN IS THE PUBLISHED CSV. Everything else was tried and closed:
 * the OData API answers 502, the Aotearoa Data Explorer serves its own
 * single-page app for every SDMX path rather than data, its faceted search
 * returns nothing, and the RBNZ refuses automated requests to its tables with
 * a 403. FRED carries a New Zealand CPI and it is dead — OECD stopped feeding
 * that series in 2023 while it kept answering HTTP 200.
 *
 * The CSV lives behind a URL naming the quarter it was published for, so the
 * address changes every release. Rather than pin one and break in three
 * months, the recent quarters are tried newest-first until one answers; the
 * newest that does is the current release by definition.
 *
 * Series CPIQ.SE9A — "CPI All Groups for New Zealand", the quarterly index.
 * Published as an index, so the rate is derived and therefore checked: the
 * index moved to 1359 for the June 2026 quarter against 1305 a year earlier.
 */

/** Twelve hours — a quarterly release, not a quote. */
const REVALIDATE = 12 * 60 * 60;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HISTORY_SINCE = "2015";

/** The all-groups CPI series inside the published file. */
const SERIES_REFERENCE = "CPIQ.SE9A";

const CONTEXT =
  "La Reserve Bank of New Zealand vise une inflation entre 1% et 3%, avec un point médian à 2% : au-dessus de 3%, elle est contrainte de garder des taux élevés.";

export interface StatsNzPoint {
  /** "2026-Q2" */
  period: string;
  value: number;
}

export interface StatsNzResult {
  field: string;
  label: string;
  displayUnit: string;
  context: string | null;
  history: StatsNzPoint[];
  error: string | null;
}

const QUARTER_MONTHS = ["March", "June", "September", "December"] as const;

/** The most recent quarter slugs, newest first. */
function candidateSlugs(now: Date): Array<{ month: string; year: number }> {
  const out: Array<{ month: string; year: number }> = [];
  let year = now.getUTCFullYear();
  let quarter = Math.floor(now.getUTCMonth() / 3); // 0-3, the quarter we are in
  // Six quarters back is a year and a half of tolerance for a late release.
  for (let i = 0; i < 6; i++) {
    quarter -= 1;
    if (quarter < 0) {
      quarter = 3;
      year -= 1;
    }
    out.push({ month: QUARTER_MONTHS[quarter]!, year });
  }
  return out;
}

/** "2026.06" -> "2026-Q2". Stats NZ labels a quarter by its ending month. */
function toQuarter(period: string): string | null {
  const match = /^(\d{4})\.(\d{2})$/.exec(period.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-Q${Math.ceil(month / 3)}`;
}

/** Splits a CSV line, honouring the quoted fields Stats NZ uses. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else current += char;
  }
  out.push(current);
  return out;
}

export async function fetchStatsNzCpi(now: Date = new Date()): Promise<StatsNzResult> {
  const base = {
    field: "cpi",
    label: "Inflation (IPC trimestriel)",
    displayUnit: "%",
    context: CONTEXT,
  };

  for (const { month, year } of candidateSlugs(now)) {
    const lower = month.toLowerCase();
    const url =
      `https://www.stats.govt.nz/assets/Uploads/Consumers-price-index/` +
      `Consumers-price-index-${month}-${year}-quarter/Download-data/` +
      `consumers-price-index-${lower}-${year}-quarter-index-numbers.csv`;

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        next: { revalidate: REVALIDATE },
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) continue;

      const lines = (await response.text()).split(/\r?\n/);
      const levels = lines
        .filter((line) => line.startsWith(`"${SERIES_REFERENCE}"`))
        .map((line) => {
          const cells = splitCsvLine(line);
          const period = toQuarter((cells[1] ?? "").replace(/"/g, ""));
          const value = Number((cells[2] ?? "").replace(/"/g, ""));
          return period !== null && Number.isFinite(value) ? { period, value } : null;
        })
        .filter((p): p is StatsNzPoint => p !== null)
        .sort((a, b) => (a.period < b.period ? -1 : 1));

      if (levels.length < 5) continue;

      // Four quarters back for the year-on-year rate everyone quotes.
      const history: StatsNzPoint[] = [];
      for (let i = 4; i < levels.length; i++) {
        const before = levels[i - 4]!;
        if (before.value === 0) continue;
        history.push({
          period: levels[i]!.period,
          value: (levels[i]!.value / before.value - 1) * 100,
        });
      }

      const trimmed = history.filter(
        (p) => p.period >= HISTORY_SINCE && p.value > -30 && p.value < 30,
      );
      if (trimmed.length === 0) continue;

      return { ...base, history: trimmed, error: null };
    } catch {
      // Try the previous quarter rather than failing on one bad URL.
      continue;
    }
  }

  return {
    ...base,
    history: [],
    error: "Aucune publication trimestrielle accessible sur les six derniers trimestres",
  };
}

/** True when Stats NZ is the source wired for this NZD field. */
export function hasStatsNzHistory(field: string): boolean {
  return field === "cpi";
}
