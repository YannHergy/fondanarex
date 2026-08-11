import "server-only";

import {
  latestOnsPoint,
  parseOnsSeries,
  toYearOnYear,
  type OnsPoint,
  type OnsResponse,
} from "@/domain/macro/ons";

/**
 * ONS — the United Kingdom's Office for National Statistics.
 *
 * No key, no registration: appending `/data` to any timeseries page URL
 * returns that series as JSON. This is the primary source for the GBP, the
 * same role Eurostat plays for the EUR.
 *
 * EVERY SERIES BELOW WAS CHECKED AGAINST THE PUBLISHED HEADLINE BEFORE BEING
 * WIRED IN, because the ONS carries several near-identical series per concept
 * and picking the wrong one returns real, plausible, wrong numbers rather than
 * an error. Two were caught that way:
 *
 *   - Wages. `kai9` is REGULAR pay (3.4%); the headline everyone quotes is
 *     TOTAL pay including bonuses, `kac3` (4.3%). A whole percentage point
 *     apart, both live, both labelled "wage growth" in casual use.
 *   - Trade balance. `boki` is the GOODS balance (-£18.7bn); the UK headline
 *     is TOTAL trade, goods and services together, `ikbj` (-£1.0bn). The UK
 *     runs a services surplus large enough that the two differ by a factor of
 *     eighteen and share no sign of magnitude. Note this is the opposite
 *     choice from the euro area, whose published headline IS a goods balance.
 *
 * A `User-Agent` is set on purpose: the ONS returns 403 to a bare programmatic
 * request.
 */

const BASE = "https://www.ons.gov.uk";

/** Twelve hours. These are monthly and quarterly releases, not quotes. */
const REVALIDATE = 12 * 60 * 60;

/**
 * How far back to keep. The ONS serves its FULL run — GDP to 1955,
 * unemployment to 1971, inflation to 1989 — which is around 2,500 rows across
 * these seven series, every one re-upserted on every refresh.
 *
 * A decade is far more than anything downstream reads: the detail chart draws
 * from 2023, the score needs a reading and the one before it, and the score
 * reconstruction goes back to 2023. Keeping 1955 would spend most of each
 * refresh rewriting figures from before the euro existed.
 */
const HISTORY_SINCE = "2015";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export class OnsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnsError";
  }
}

interface SeriesConfig {
  /** Field on CurrencyData this series feeds. */
  field: string;
  label: string;
  /** Section of the ONS site the series lives under. */
  path: string;
  /** ONS series identifier, e.g. "d7g7". */
  cdid: string;
  /** ONS dataset the series belongs to, e.g. "mm23". */
  dataset: string;
  /**
   * Divides the raw value. The ONS reports the trade balance in £ MILLIONS
   * while the scoring engine's thresholds are written for billions — the same
   * conversion Eurostat's trade balance needs.
   */
  scale?: number;
  /**
   * Turn an index into its year-on-year rate. Retail sales are published as a
   * volume INDEX with no year-on-year series beside them, while the headline
   * is the year-on-year rate.
   */
  deriveYoY?: boolean;
  displayUnit: string;
  /** Written context for the generated commentary — see lib/commentary.ts. */
  context: string | null;
  /** The published figure this was checked against, and when. */
  verifiedAgainst: string;
}

const SERIES: readonly SeriesConfig[] = [
  {
    field: "cpi",
    label: "Inflation (CPI)",
    path: "economy/inflationandpriceindices",
    cdid: "d7g7",
    dataset: "mm23",
    displayUnit: "%",
    context:
      "La Banque d'Angleterre vise une inflation de 2% ; au-delà de 3%, elle doit adresser une lettre explicative au Chancelier de l'Échiquier.",
    verifiedAgainst: "2,6% en juin 2026",
  },
  {
    field: "coreCpi",
    label: "Inflation sous-jacente",
    path: "economy/inflationandpriceindices",
    // CPI excluding energy, food, alcohol and tobacco — the same exclusions
    // the euro-area core measure uses, so the two currencies stay comparable.
    cdid: "dko8",
    dataset: "mm23",
    displayUnit: "%",
    context:
      "L'inflation sous-jacente exclut l'énergie et l'alimentation, trop volatiles ; c'est elle que la Banque d'Angleterre surveille pour juger si l'inflation est durablement ancrée.",
    verifiedAgainst: "2,6% en juin 2026",
  },
  {
    field: "gdpQoQ",
    label: "PIB trimestriel",
    path: "economy/grossdomesticproductgdp",
    // Chain volume measure, seasonally adjusted, quarter on the previous
    // quarter — which is what `gdpQoQ` means everywhere else in the app.
    cdid: "ihyq",
    dataset: "pn2",
    displayUnit: "%",
    context:
      "Une croissance trimestrielle britannique entre 0,2% et 0,5% est considérée comme solide ; en dessous de 0%, l'économie se contracte.",
    verifiedAgainst: "+0,6% au T1 2026",
  },
  {
    field: "unemployment",
    label: "Chômage",
    path: "employmentandlabourmarket/peoplenotinwork/unemployment",
    cdid: "mgsx",
    dataset: "lms",
    displayUnit: "%",
    context:
      "Un taux de chômage britannique sous 4,5% est considéré comme proche du plein emploi ; sa remontée pèse sur les anticipations de baisse de taux.",
    verifiedAgainst: "4,9% en avril 2026",
  },
  {
    field: "wagePPI",
    label: "Croissance des salaires",
    path: "employmentandlabourmarket/peopleinwork/earningsandworkinghours",
    // TOTAL pay, bonuses included — see the note at the top of this file.
    cdid: "kac3",
    dataset: "lms",
    displayUnit: "%",
    context:
      "La Banque d'Angleterre surveille de près les salaires : une croissance durablement au-dessus de 3% est jugée incompatible avec une inflation à 2%, l'économie britannique étant à 80% une économie de services où les salaires font les prix.",
    verifiedAgainst: "4,3% en mai 2026",
  },
  {
    field: "tradeBalance",
    label: "Balance commerciale",
    path: "economy/nationalaccounts/balanceofpayments",
    // TOTAL trade, goods AND services — see the note at the top of this file.
    cdid: "ikbj",
    dataset: "mret",
    scale: 1000,
    displayUnit: " Md£",
    context:
      "Le Royaume-Uni importe plus de biens qu'il n'en exporte mais dégage un large excédent sur les services : c'est la balance totale, biens et services confondus, qui donne la mesure réelle de son commerce extérieur.",
    verifiedAgainst: "−1,044 Md£ en mai 2026",
  },
  {
    field: "retailSales",
    label: "Ventes au détail",
    path: "businessindustryandtrade/retailindustry",
    // Volume index, all retailers including fuel, seasonally adjusted. The
    // year-on-year rate is derived — see `deriveYoY`.
    cdid: "j5ek",
    dataset: "drsi",
    deriveYoY: true,
    displayUnit: "%",
    context:
      "Les ventes au détail mesurent la consommation des ménages, moteur principal de l'économie britannique ; une croissance annuelle positive soutient la livre.",
    verifiedAgainst: "+4,2% en juin 2026",
  },
];

export interface OnsSeriesResult {
  field: string;
  label: string;
  displayUnit: string;
  context: string | null;
  latest: OnsPoint | null;
  /** Full history, oldest first. */
  history: OnsPoint[];
  /** ONS publishes its own release calendar, unlike Eurostat. */
  nextRelease: string | null;
  error: string | null;
}

/**
 * Sanity bound, applied after scaling.
 *
 * Every ONS series here is either a percentage or a balance already converted
 * to billions. Nothing legitimately leaves this band, so a value outside it
 * means the wrong series or a missed scale conversion — the check that would
 * have caught a £-millions balance being scored against thresholds written for
 * billions.
 */
function isPlausible(value: number): boolean {
  return Number.isFinite(value) && value > -500 && value < 500;
}

async function fetchSeries(config: SeriesConfig): Promise<OnsSeriesResult> {
  const base = {
    field: config.field,
    label: config.label,
    displayUnit: config.displayUnit,
    context: config.context,
  };

  const url = `${BASE}/${config.path}/timeseries/${config.cdid}/${config.dataset}/data`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return {
        ...base,
        latest: null,
        history: [],
        nextRelease: null,
        error: `ONS ${response.status}`,
      };
    }

    const payload = (await response.json()) as OnsResponse;
    const scale = config.scale ?? 1;

    let history = parseOnsSeries(payload);
    // Derive BEFORE trimming: a year-on-year rate needs the twelve months
    // before the first month it reports on.
    if (config.deriveYoY) history = toYearOnYear(history);
    history = history
      .filter((point) => point.period >= HISTORY_SINCE)
      .map((point) => ({ ...point, value: point.value / scale }))
      .filter((point) => isPlausible(point.value));

    if (history.length === 0) {
      return {
        ...base,
        latest: null,
        history: [],
        nextRelease: null,
        error: "Aucune valeur publiée (identifiant de série probablement invalide)",
      };
    }

    return {
      ...base,
      latest: latestOnsPoint(history),
      history,
      nextRelease: payload.description?.nextRelease ?? null,
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      latest: null,
      history: [],
      nextRelease: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Every UK series, fetched together. A failing series carries its own error. */
export async function fetchOnsData(): Promise<OnsSeriesResult[]> {
  return Promise.all(SERIES.map(fetchSeries));
}

/** True when the ONS is the source wired for this field. */
export function hasOnsHistory(field: string): boolean {
  return SERIES.some((s) => s.field === field);
}

/** Full history for one GBP field — used by the indicator detail page's chart. */
export async function getOnsHistory(field: string): Promise<OnsSeriesResult | null> {
  const config = SERIES.find((s) => s.field === field);
  if (!config) return null;
  return fetchSeries(config);
}
