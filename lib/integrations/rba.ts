import "server-only";

/**
 * Reserve Bank of Australia — statistical table G1, Consumer Price Inflation.
 *
 * The RBA publishes its statistical tables as plain CSV at fixed URLs: no key,
 * no registration, and — unlike most of the sources here — the rates come out
 * ALREADY COMPUTED as year-ended percentages, so nothing has to be derived.
 *
 * This is the primary source for Australian inflation because the two obvious
 * alternatives failed: FRED's Australian CPI comes through OECD's Main
 * Economic Indicators, whose feed stopped in January 2025 while still
 * answering HTTP 200, and the ABS data API did not resolve at all from here.
 *
 * The table is QUARTERLY, which is what the AUD profile scores ("CPI
 * trimestriel"). Australia also publishes a monthly CPI indicator; it is a
 * different series and not the one weighted here.
 *
 * A `User-Agent` is set on purpose: rba.gov.au refuses a bare programmatic
 * request.
 */

const URL_G1 = "https://www.rba.gov.au/statistics/tables/csv/g1-data.csv";

/** Twelve hours — a quarterly release, not a quote. */
const REVALIDATE = 12 * 60 * 60;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const HISTORY_SINCE = "2015";

export interface RbaPoint {
  /** "2026-Q2" */
  period: string;
  value: number;
}

interface SeriesConfig {
  field: string;
  label: string;
  /** RBA series identifier, matched against the "Series ID" row. */
  seriesId: string;
  displayUnit: string;
  context: string | null;
  verifiedAgainst: string;
}

const SERIES: readonly SeriesConfig[] = [
  {
    field: "cpi",
    label: "Inflation (IPC trimestriel)",
    seriesId: "GCPIAGYP",
    displayUnit: "%",
    context:
      "La Reserve Bank of Australia vise une inflation entre 2% et 3% en moyenne sur le cycle : au-dessus de 3%, elle est en territoire inconfortable.",
    verifiedAgainst: "3,9% au T2 2026",
  },
  {
    field: "coreCpi",
    label: "Inflation sous-jacente (moyenne tronquée)",
    // The trimmed mean is the RBA's own preferred underlying measure, and the
    // one the AUD profile names.
    seriesId: "GCPIOCPMTMYP",
    displayUnit: "%",
    context:
      "La moyenne tronquée écarte les variations de prix extrêmes : c'est la mesure d'inflation sous-jacente que la RBA privilégie pour décider de ses taux.",
    verifiedAgainst: "3,6% au T2 2026, identique au chiffre publié",
  },
];

export interface RbaSeriesResult {
  field: string;
  label: string;
  displayUnit: string;
  context: string | null;
  history: RbaPoint[];
  error: string | null;
}

/** Splits a CSV line, honouring the quoted column titles the RBA uses. */
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

/** "30/06/2026" -> "2026-Q2". The RBA stamps a quarter with its last day. */
function toQuarter(australianDate: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(australianDate.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[3]}-Q${Math.ceil(month / 3)}`;
}

export async function fetchRbaData(): Promise<RbaSeriesResult[]> {
  const bases = SERIES.map((s) => ({
    field: s.field,
    label: s.label,
    displayUnit: s.displayUnit,
    context: s.context,
  }));

  try {
    const response = await fetch(URL_G1, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(25_000),
    });

    if (!response.ok) {
      return bases.map((b) => ({ ...b, history: [], error: `RBA ${response.status}` }));
    }

    const lines = (await response.text()).split(/\r?\n/);
    const idRow = splitCsvLine(lines.find((l) => l.startsWith("Series ID")) ?? "");
    // Rows whose first cell is a date are the observations; the file also
    // carries future quarters with empty cells, which fall out below.
    const dataRows = lines
      .filter((l) => /^\d{2}\/\d{2}\/\d{4},/.test(l))
      .map((l) => splitCsvLine(l));

    return SERIES.map((config, index) => {
      const base = bases[index]!;
      const column = idRow.indexOf(config.seriesId);
      if (column < 0) {
        return { ...base, history: [], error: `Série ${config.seriesId} absente du tableau G1` };
      }

      const history = dataRows
        .map((cells) => {
          const period = toQuarter(cells[0] ?? "");
          const raw = (cells[column] ?? "").trim();
          if (period === null || raw === "") return null;
          const value = Number(raw);
          return Number.isFinite(value) ? { period, value } : null;
        })
        .filter((p): p is RbaPoint => p !== null)
        .filter((p) => p.period >= HISTORY_SINCE && p.value > -30 && p.value < 30)
        .sort((a, b) => (a.period < b.period ? -1 : 1));

      if (history.length === 0) {
        return { ...base, history: [], error: "Aucune valeur exploitable" };
      }
      return { ...base, history, error: null };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return bases.map((b) => ({ ...b, history: [], error: message }));
  }
}

/** True when the RBA is the source wired for this field. */
export function hasRbaHistory(field: string): boolean {
  return SERIES.some((s) => s.field === field);
}

/** Full history for one AUD field — used by the indicator detail page's chart. */
export async function getRbaHistory(field: string): Promise<RbaSeriesResult | null> {
  const all = await fetchRbaData();
  return all.find((r) => r.field === field) ?? null;
}
