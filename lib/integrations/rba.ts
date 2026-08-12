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

const TABLE_URL = (table: string) =>
  `https://www.rba.gov.au/statistics/tables/csv/${table}-data.csv`;

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
  /** Statistical table the series lives in, e.g. "g1" or "h5". */
  table: string;
  /** RBA series identifier, matched against the "Series ID" row. */
  seriesId: string;
  /** Monthly tables stamp a month; quarterly ones stamp a quarter. */
  frequency: "monthly" | "quarterly";
  /**
   * "level" keeps the published figure — the rate tables already carry one.
   * "chg" turns a level into its change on the previous period, which is what
   * the employment series needs.
   */
  transform: "level" | "chg";
  displayUnit: string;
  context: string | null;
  verifiedAgainst: string;
}

const SERIES: readonly SeriesConfig[] = [
  {
    field: "cpi",
    label: "Inflation (IPC trimestriel)",
    table: "g1",
    seriesId: "GCPIAGYP",
    frequency: "quarterly",
    transform: "level",
    displayUnit: "%",
    context:
      "La Reserve Bank of Australia vise une inflation entre 2% et 3% en moyenne sur le cycle : au-dessus de 3%, elle est en territoire inconfortable.",
    verifiedAgainst: "3,9% au T2 2026",
  },
  {
    field: "coreCpi",
    label: "Inflation sous-jacente (moyenne tronquée)",
    table: "g1",
    // The trimmed mean is the RBA's own preferred underlying measure, and the
    // one the AUD profile names.
    seriesId: "GCPIOCPMTMYP",
    frequency: "quarterly",
    transform: "level",
    displayUnit: "%",
    context:
      "La moyenne tronquée écarte les variations de prix extrêmes : c'est la mesure d'inflation sous-jacente que la RBA privilégie pour décider de ses taux.",
    verifiedAgainst: "3,6% au T2 2026, identique au chiffre publié",
  },
  {
    field: "employmentChange",
    label: "Emploi (variation mensuelle)",
    // Table H5 carries the ABS labour-force series, monthly, in thousands of
    // persons. Taken here rather than from FRED, whose Australian employment
    // arrives through the OECD a full release late — it was still reporting
    // May at 40.3k when the published June figure was 76.3k.
    table: "h5",
    seriesId: "GLFSEPTSA",
    frequency: "monthly",
    transform: "chg",
    displayUnit: " k",
    context:
      "La variation mensuelle de l'emploi est le principal indicateur du marché du travail australien : au-dessus de 20 000 créations, le marché est jugé solide.",
    verifiedAgainst: "+76,4 k en juin 2026 contre 76 343 publiés",
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

/**
 * "30/06/2026" -> "2026-Q2" or "2026-06". The RBA stamps every period with its
 * LAST day, so a quarter is identified by the month it ends in.
 */
function toPeriod(australianDate: string, frequency: "monthly" | "quarterly"): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(australianDate.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return frequency === "quarterly"
    ? `${match[3]}-Q${Math.ceil(month / 3)}`
    : `${match[3]}-${match[2]}`;
}

/** One RBA statistical table, parsed into its rows once per refresh. */
async function fetchTable(table: string): Promise<{ idRow: string[]; dataRows: string[][] } | null> {
  const response = await fetch(TABLE_URL(table), {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: REVALIDATE },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) return null;

  const lines = (await response.text()).split(/\r?\n/);
  return {
    idRow: splitCsvLine(lines.find((l) => l.startsWith("Series ID")) ?? ""),
    // Rows whose first cell is a date are the observations. The files also
    // carry future periods with empty cells, which fall out when parsed.
    dataRows: lines.filter((l) => /^\d{2}\/\d{2}\/\d{4},/.test(l)).map((l) => splitCsvLine(l)),
  };
}

export async function fetchRbaData(): Promise<RbaSeriesResult[]> {
  const bases = SERIES.map((s) => ({
    field: s.field,
    label: s.label,
    displayUnit: s.displayUnit,
    context: s.context,
  }));

  try {
    // Each table is fetched once even when several series come from it.
    const tables = new Map<string, Awaited<ReturnType<typeof fetchTable>>>();
    for (const name of new Set(SERIES.map((s) => s.table))) {
      tables.set(name, await fetchTable(name));
    }

    return SERIES.map((config, index) => {
      const base = bases[index]!;
      const table = tables.get(config.table);
      if (!table) {
        return { ...base, history: [], error: `Tableau ${config.table.toUpperCase()} indisponible` };
      }

      const column = table.idRow.indexOf(config.seriesId);
      if (column < 0) {
        return {
          ...base,
          history: [],
          error: `Série ${config.seriesId} absente du tableau ${config.table.toUpperCase()}`,
        };
      }

      const levels = table.dataRows
        .map((cells) => {
          const period = toPeriod(cells[0] ?? "", config.frequency);
          const raw = (cells[column] ?? "").trim();
          if (period === null || raw === "") return null;
          const value = Number(raw);
          return Number.isFinite(value) ? { period, value } : null;
        })
        .filter((p): p is RbaPoint => p !== null)
        .sort((a, b) => (a.period < b.period ? -1 : 1));

      const transformed =
        config.transform === "chg"
          ? levels
              .slice(1)
              .map((p, i) => ({ period: p.period, value: p.value - levels[i]!.value }))
          : levels;

      const history = transformed.filter(
        (p) => p.period >= HISTORY_SINCE && p.value > -2000 && p.value < 2000,
      );

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
