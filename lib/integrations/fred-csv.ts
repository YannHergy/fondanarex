import "server-only";

import {
  latestFredPoint,
  parseFredCsv,
  type FredFrequency,
  type FredPoint,
} from "@/domain/macro/fred-csv";

/**
 * FRED — Federal Reserve Bank of St. Louis, through its key-free CSV export.
 *
 * This is the primary source for the USD, and fills gaps for four other
 * currencies. Distinct from lib/integrations/fred.ts, which speaks the keyed
 * JSON API and has never run here — FRED_API_KEY has never been configured.
 * `fredgraph.csv` needs no key at all.
 *
 * TRANSFORMATIONS ARE FRED'S, NOT OURS. Asking for `transformation=pc1`
 * returns the year-on-year rate computed by FRED; deriving it here from the
 * index gave 3.88% for June 2026 US inflation where the published figure was
 * 3.5%. Same series, same index values — the arithmetic was ours and it was
 * wrong. Every rate below is therefore requested, never computed.
 *
 * WHAT IS DELIBERATELY ABSENT: the CPI of every non-US currency. FRED carries
 * them through OECD's Main Economic Indicators, and OECD stopped feeding that
 * collection — Japan's stops in 2021, Australia's, Canada's, New Zealand's and
 * Switzerland's in 2025. They return HTTP 200 with real-looking numbers years
 * out of date, which is the most dangerous shape a data source can take, so
 * they are not wired and their currencies take their CPI elsewhere.
 */

const BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv";

/** Twelve hours. These are monthly and quarterly releases, not quotes. */
const REVALIDATE = 12 * 60 * 60;

/** Same anchor as the other sources — a decade is far more than anything reads. */
const HISTORY_SINCE = "2015-01-01";

export class FredCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FredCsvError";
  }
}

interface SeriesConfig {
  currency: string;
  field: string;
  label: string;
  /** FRED series identifier, e.g. "CPIAUCNS". */
  id: string;
  frequency: FredFrequency;
  /**
   * FRED's own transformation, applied server-side:
   *   pc1 — percent change from a year ago
   *   pch — percent change from the previous period
   *   chg — change from the previous period
   *   ""  — the series as published
   */
  transformation: "pc1" | "pch" | "chg" | "";
  /** Divides the transformed value. Trade balance arrives in millions, payroll changes in thousands-of-persons. */
  scale?: number;
  displayUnit: string;
  context: string | null;
  /** The published figure this was checked against. */
  verifiedAgainst: string;
}

const SERIES: readonly SeriesConfig[] = [
  // ── USD — nine indicators, 62% of the dollar's profile ──────────────────
  {
    currency: "USD",
    field: "cpi",
    label: "Inflation (CPI)",
    // NSA, which is the convention the headline US rate is published in.
    id: "CPIAUCNS",
    frequency: "monthly",
    transformation: "pc1",
    displayUnit: "%",
    context:
      "La Réserve fédérale vise une inflation de 2% à long terme ; au-dessus de 3%, la pression pour maintenir des taux élevés s'accentue.",
    verifiedAgainst: "3,5% en juin 2026",
  },
  {
    currency: "USD",
    field: "coreCpi",
    label: "Inflation sous-jacente",
    id: "CPILFENS",
    frequency: "monthly",
    transformation: "pc1",
    displayUnit: "%",
    context:
      "L'inflation sous-jacente exclut l'alimentation et l'énergie ; c'est la mesure que la Fed suit pour juger de la tendance de fond des prix.",
    verifiedAgainst: "2,60% en juin 2026",
  },
  {
    currency: "USD",
    field: "corePce",
    label: "Core PCE",
    // The Fed's OWN preferred gauge — the one the dot plot is written against.
    id: "PCEPILFE",
    frequency: "monthly",
    transformation: "pc1",
    displayUnit: "%",
    context:
      "Le Core PCE est l'indicateur d'inflation préféré de la Fed, celui auquel se réfèrent ses projections : c'est lui, plus que le CPI, qui décide de la trajectoire des taux.",
    verifiedAgainst: "3,30% en juin 2026",
  },
  {
    currency: "USD",
    field: "gdpQoQ",
    label: "PIB trimestriel",
    // Already a percentage: real GDP, change on the preceding quarter,
    // ANNUALISED — the convention the US publishes in, unlike Europe.
    id: "A191RL1Q225SBEA",
    frequency: "quarterly",
    transformation: "",
    displayUnit: "%",
    context:
      "Les États-Unis publient leur croissance en rythme annualisé, contrairement à l'Europe : 2% à 3% correspond à une économie solide, en dessous de 0% à une contraction.",
    verifiedAgainst: "+1,5% au T2 2026",
  },
  {
    currency: "USD",
    field: "unemployment",
    label: "Chômage",
    id: "UNRATE",
    frequency: "monthly",
    transformation: "",
    displayUnit: "%",
    context:
      "Un chômage américain sous 4,5% est considéré comme proche du plein emploi ; sa remontée est le signal que la Fed surveille pour commencer à baisser ses taux.",
    verifiedAgainst: "4,10% en juillet 2026",
  },
  {
    currency: "USD",
    field: "wagePPI",
    label: "Croissance des salaires",
    // Average hourly earnings, all private employees — the wage figure inside
    // the payrolls report, and the one the dollar trades on.
    id: "CES0500000003",
    frequency: "monthly",
    transformation: "pc1",
    displayUnit: "%",
    context:
      "Le salaire horaire moyen est publié avec le rapport sur l'emploi : une croissance au-dessus de 4% est jugée incompatible avec un retour de l'inflation à 2%.",
    verifiedAgainst: "3,2% en juillet 2026",
  },
  {
    currency: "USD",
    field: "retailSales",
    label: "Ventes au détail",
    id: "RSAFS",
    frequency: "monthly",
    transformation: "pc1",
    displayUnit: "%",
    context:
      "La consommation fait environ 70% du PIB américain : des ventes au détail en croissance annuelle soutiennent le dollar.",
    verifiedAgainst: "+6,7% en juin 2026",
  },
  {
    currency: "USD",
    field: "tradeBalance",
    label: "Balance commerciale",
    // Goods AND services, the published headline. Millions of dollars.
    id: "BOPGSTB",
    frequency: "monthly",
    transformation: "",
    scale: 1000,
    displayUnit: " Md$",
    context:
      "Les États-Unis sont en déficit commercial structurel ; c'est son creusement ou sa réduction, plus que son signe, qui compte pour le dollar.",
    verifiedAgainst: "−73,26 Md$ en juin 2026",
  },
  {
    currency: "USD",
    field: "nfp",
    label: "NFP (emplois non agricoles)",
    // Total nonfarm payrolls as a LEVEL in thousands; `chg` turns it into the
    // monthly creation figure the market reacts to.
    id: "PAYEMS",
    frequency: "monthly",
    transformation: "chg",
    displayUnit: " k",
    context:
      "Les créations d'emplois non agricoles sont la publication la plus suivie du calendrier américain : au-dessus de 150 000 le marché du travail est solide, en dessous de zéro il se contracte.",
    verifiedAgainst: "−23 000 en juillet 2026",
  },

  // ── Gap-fillers for four other currencies ───────────────────────────────
  //
  // These come from OECD's labour-force collection inside FRED, which is
  // still maintained but publishes about a release behind the national
  // office: Canada's May figure matched the published PREVIOUS value exactly
  // while the national print had already moved on. The series are right; they
  // arrive late. Worth having — each currency's alternative today is two
  // points from an aggregator — but not worth mistaking for same-day data.
  {
    currency: "AUD",
    field: "employmentChange",
    label: "Emploi (variation)",
    id: "LFEMTTTTAUM647S",
    frequency: "monthly",
    transformation: "chg",
    scale: 1000,
    displayUnit: " k",
    context:
      "La variation mensuelle de l'emploi australien est le principal indicateur du marché du travail suivi par la RBA.",
    verifiedAgainst: "série conforme, décalée d'une publication",
  },
  {
    currency: "CAD",
    field: "employmentChange",
    label: "Emploi (variation)",
    id: "LFEMTTTTCAM647S",
    frequency: "monthly",
    transformation: "chg",
    scale: 1000,
    displayUnit: " k",
    context:
      "La variation mensuelle de l'emploi canadien pèse lourd dans les décisions de la Banque du Canada.",
    verifiedAgainst: "18,2 k = valeur précédente publiée, série conforme",
  },
  {
    currency: "CAD",
    field: "gdpQoQ",
    label: "PIB trimestriel",
    id: "NGDPRSAXDCCAQ",
    frequency: "quarterly",
    transformation: "pch",
    displayUnit: "%",
    context:
      "Une croissance trimestrielle canadienne entre 0,2% et 0,5% est considérée comme solide ; en dessous de 0%, l'économie se contracte.",
    verifiedAgainst: "−0,04% vs 0,0% publié (arrondi)",
  },
  {
    currency: "NZD",
    field: "employmentChange",
    label: "Emploi (variation trimestrielle)",
    // The NZD profile scores this as a PERCENTAGE, unlike the AUD and CAD —
    // see unitFor() on the indicator page.
    id: "LFEMTTTTNZQ647S",
    frequency: "quarterly",
    transformation: "pch",
    displayUnit: "%",
    context:
      "La Nouvelle-Zélande publie sa variation d'emploi en pourcentage trimestriel ; au-dessus de 0,5% le marché du travail est dynamique.",
    verifiedAgainst: "série conforme, décalée d'une publication",
  },
];

export interface FredCsvSeriesResult {
  currency: string;
  field: string;
  label: string;
  displayUnit: string;
  context: string | null;
  latest: FredPoint | null;
  history: FredPoint[];
  error: string | null;
}

/**
 * Sanity bound, applied after scaling.
 *
 * Everything here is a percentage, a balance in billions, or a job count in
 * thousands. A value outside this band means a missed scale conversion or the
 * wrong series — the check that catches a payroll LEVEL (158,858) being stored
 * where a monthly CHANGE (-23) belongs.
 */
function isPlausible(value: number): boolean {
  return Number.isFinite(value) && value > -2000 && value < 2000;
}

async function fetchSeries(config: SeriesConfig): Promise<FredCsvSeriesResult> {
  const base = {
    currency: config.currency,
    field: config.field,
    label: config.label,
    displayUnit: config.displayUnit,
    context: config.context,
  };

  const url = new URL(BASE);
  url.searchParams.set("id", config.id);
  url.searchParams.set("cosd", HISTORY_SINCE);
  if (config.transformation) url.searchParams.set("transformation", config.transformation);

  try {
    const response = await fetch(url, {
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return { ...base, latest: null, history: [], error: `FRED ${response.status}` };
    }

    const scale = config.scale ?? 1;
    const history = parseFredCsv(await response.text(), config.frequency)
      .map((point) => ({ ...point, value: point.value / scale }))
      .filter((point) => isPlausible(point.value));

    if (history.length === 0) {
      return {
        ...base,
        latest: null,
        history: [],
        error: "Aucune valeur publiée (identifiant de série probablement invalide)",
      };
    }

    return { ...base, latest: latestFredPoint(history), history, error: null };
  } catch (error) {
    return {
      ...base,
      latest: null,
      history: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Every configured series, fetched together. A failing one carries its own error. */
export async function fetchFredCsvData(): Promise<FredCsvSeriesResult[]> {
  return Promise.all(SERIES.map(fetchSeries));
}

/** True when FRED's CSV export is the source wired for this (currency, field). */
export function hasFredCsvHistory(currency: string, field: string): boolean {
  return SERIES.some((s) => s.currency === currency && s.field === field);
}

/** Full history for one field — used by the indicator detail page's chart. */
export async function getFredCsvHistory(
  currency: string,
  field: string,
): Promise<FredCsvSeriesResult | null> {
  const config = SERIES.find((s) => s.currency === currency && s.field === field);
  if (!config) return null;
  return fetchSeries(config);
}
