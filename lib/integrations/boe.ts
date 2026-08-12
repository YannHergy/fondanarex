import "server-only";

/**
 * Bank of England — Interactive Statistical Database (IADB), Bank Rate.
 *
 * The ONS (lib/integrations/ons.ts) is the UK's statistical office and covers
 * CPI, GDP, unemployment, wages, trade and retail sales — everything EXCEPT
 * the policy rate, which the ONS does not publish. Same split as the EUR
 * (Eurostat vs the ECB) and the CHF (the federal statistical office vs the
 * SNB): the rate has to come from the central bank that sets it.
 *
 * The IADB's CSV export needs no key: `SeriesCodes=IUDBEDR` is "Bank Rate",
 * the MPC's single policy rate. No `User-Agent` spoofing needed either,
 * unlike the ONS's own site or the RBA's — confirmed live.
 *
 * Verified against Trading Economics: 3.75% as of 11 August 2026, exact match.
 */

const URL_BASE = "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp";

/** Twelve hours — the MPC meets on a schedule, this is not a quote. */
const REVALIDATE = 12 * 60 * 60;

const HISTORY_SINCE = "2015";

const MONTH_ABBR: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

export interface BoePoint {
  /** "2026-08-11" — daily, flat between MPC decisions. */
  period: string;
  value: number;
}

export interface BoeSeriesResult {
  field: "interestRate";
  label: string;
  displayUnit: string;
  context: string | null;
  history: BoePoint[];
  error: string | null;
}

const CONTEXT =
  "Le Bank Rate est le taux directeur de la Banque d'Angleterre, fixé par le Monetary Policy Committee (MPC) : chacune de ses huit réunions annuelles déplace directement l'attractivité de la livre sterling.";

/** "11 Aug 2026" -> "2026-08-11". Returns null on anything unrecognised. */
function toPeriod(boeDate: string): string | null {
  const match = /^(\d{2}) ([A-Za-z]{3}) (\d{4})$/.exec(boeDate.trim());
  if (!match) return null;
  const month = MONTH_ABBR[match[2]!];
  if (!month) return null;
  return `${match[3]}-${month}-${match[1]}`;
}

export async function fetchBoeData(): Promise<BoeSeriesResult[]> {
  const base = {
    field: "interestRate" as const,
    label: "Taux directeur (Bank Rate)",
    displayUnit: "%",
    context: CONTEXT,
  };

  const url = new URL(URL_BASE);
  url.searchParams.set("csv.x", "yes");
  url.searchParams.set("Datefrom", `01/Jan/${HISTORY_SINCE}`);
  url.searchParams.set("Dateto", "now");
  url.searchParams.set("SeriesCodes", "IUDBEDR");
  url.searchParams.set("CSVF", "TN");
  url.searchParams.set("UsingCodes", "Y");
  url.searchParams.set("VPD", "Y");
  url.searchParams.set("VFD", "N");

  try {
    const response = await fetch(url, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return [{ ...base, history: [], error: `BoE ${response.status}` }];
    }

    const lines = (await response.text()).split(/\r?\n/);
    const history = lines
      .map((line) => {
        const comma = line.indexOf(",");
        if (comma < 0) return null;
        const period = toPeriod(line.slice(0, comma));
        const value = Number(line.slice(comma + 1).trim());
        if (period === null || !Number.isFinite(value)) return null;
        return { period, value };
      })
      .filter((p): p is BoePoint => p !== null && p.value > -1 && p.value < 20)
      .sort((a, b) => (a.period < b.period ? -1 : 1));

    if (history.length === 0) {
      return [{ ...base, history: [], error: "Aucune valeur exploitable (format CSV probablement changé)" }];
    }

    return [{ ...base, history, error: null }];
  } catch (error) {
    return [{ ...base, history: [], error: error instanceof Error ? error.message : String(error) }];
  }
}

/** True when the BoE is the source wired for this field (GBP's policy rate only). */
export function hasBoeHistory(field: string): boolean {
  return field === "interestRate";
}

/** Full history for the GBP policy rate, straight from the BoE — used by the indicator detail page's chart. */
export async function getBoeHistory(field: string): Promise<BoeSeriesResult | null> {
  if (!hasBoeHistory(field)) return null;
  const [result] = await fetchBoeData();
  return result ?? null;
}
