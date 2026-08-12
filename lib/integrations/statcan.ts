import "server-only";

/**
 * Statistics Canada — Web Data Service.
 *
 * No key, no registration: a POST of vector ids returns those series as JSON.
 * The primary source for Canadian inflation, which FRED could not supply —
 * its Canadian CPI comes through OECD's Main Economic Indicators and that feed
 * stopped in March 2025 while still answering HTTP 200.
 *
 * StatCan publishes the CPI as an INDEX, not as a rate, so the year-on-year
 * change is derived here. That derivation is the one thing worth distrusting
 * — the same step computed a US inflation rate a third of a point wrong
 * earlier — so it was checked against the published figures before being
 * wired: 3.23% for May 2026 and 2.80% for June against prints of 3.2% and
 * 2.8%, and 2.14% for the core measure against a print of 2.1%.
 */

const ENDPOINT =
  "https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods";

/** Twelve hours — a monthly release, not a quote. */
const REVALIDATE = 12 * 60 * 60;

/**
 * Enough points for a decade of derived year-on-year values: the twelve-month
 * lag means the first year of any window produces nothing.
 */
const PERIODS = 150;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface StatCanPoint {
  /** "2026-06" */
  period: string;
  value: number;
}

interface SeriesConfig {
  field: string;
  label: string;
  vectorId: number;
  /**
   * StatCan publishes levels and indices, never rates, so each series says how
   * to turn its own into the figure the app scores:
   *   yoy — percent change on the same month a year earlier (price indices)
   *   pch — percent change on the previous month (monthly GDP)
   *   chg — change on the previous month, scaled (employment, in thousands)
   */
  transform: "yoy" | "pch" | "chg";
  scale?: number;
  displayUnit: string;
  context: string | null;
  verifiedAgainst: string;
}

const SERIES: readonly SeriesConfig[] = [
  {
    field: "cpi",
    label: "Inflation (IPC)",
    // All-items CPI, Canada, 2002 = 100.
    vectorId: 41690973,
    transform: "yoy",
    displayUnit: "%",
    context:
      "La Banque du Canada vise 2% d'inflation, dans une fourchette de contrôle de 1% à 3% : au-dessus de 3%, la pression pour maintenir des taux élevés s'accentue.",
    verifiedAgainst: "3,2% en mai 2026 et 2,8% en juin",
  },
  {
    field: "coreCpi",
    label: "Inflation sous-jacente (CPI-trim)",
    // CPI-trim, one of the two preferred core measures of the Bank of Canada.
    // The other candidate vector (112593704) derived to 3.0% where the
    // published core rate was 2.1%, so it is a different measure.
    vectorId: 112593705,
    transform: "yoy",
    displayUnit: "%",
    context:
      "La Banque du Canada suit des mesures d'inflation « rognée » qui écartent les variations extrêmes : c'est sur elles, plus que sur l'indice global, qu'elle fonde ses décisions de taux.",
    verifiedAgainst: "2,14% contre 2,1% publié",
  },
  {
    field: "employmentChange",
    label: "Emploi (variation mensuelle)",
    // Labour Force Survey, employment level, seasonally adjusted, in
    // thousands. Taken here rather than from FRED, whose Canadian employment
    // reaches it through the OECD a release late: FRED was still reporting
    // June at 18.2k — the published PREVIOUS value — when StatCan had already
    // printed July at 75.1k.
    vectorId: 2062811,
    transform: "chg",
    displayUnit: " k",
    context:
      "La variation mensuelle de l'emploi canadien pèse lourd dans les décisions de la Banque du Canada : au-dessus de 25 000 créations, le marché du travail est jugé solide.",
    verifiedAgainst: "+75,1 k en juillet 2026, identique au chiffre publié",
  },
  {
    field: "gdpQoQ",
    label: "PIB mensuel",
    // Real GDP at basic prices, monthly. The CAD profile scores a MONTHLY
    // GDP — Canada is unusual in publishing one — where the FRED series
    // previously wired here was quarterly, so it answered a different
    // question from the one the profile asks.
    vectorId: 65201210,
    transform: "pch",
    displayUnit: "%",
    context:
      "Le Canada publie un PIB mensuel, rare parmi les grandes économies : une croissance mensuelle positive et régulière soutient le dollar canadien.",
    verifiedAgainst: "+0,34% en mai 2026",
  },
];

export interface StatCanSeriesResult {
  field: string;
  label: string;
  displayUnit: string;
  context: string | null;
  history: StatCanPoint[];
  error: string | null;
}

interface WdsResponse {
  status?: string;
  object?: {
    vectorId?: number;
    vectorDataPoint?: Array<{ refPer?: string; value?: number | string }>;
  };
}

/** Applies a series' own transform to the raw levels StatCan publishes. */
function transformPoints(
  points: StatCanPoint[],
  transform: SeriesConfig["transform"],
  scale: number,
): StatCanPoint[] {
  const lag = transform === "yoy" ? 12 : 1;
  const out: StatCanPoint[] = [];
  for (let i = lag; i < points.length; i++) {
    const now = points[i]!;
    const before = points[i - lag]!;
    if (transform === "chg") {
      out.push({ period: now.period, value: (now.value - before.value) / scale });
      continue;
    }
    if (before.value === 0) continue;
    out.push({ period: now.period, value: (now.value / before.value - 1) * 100 });
  }
  return out;
}

export async function fetchStatCanData(): Promise<StatCanSeriesResult[]> {
  const bases = SERIES.map((s) => ({
    field: s.field,
    label: s.label,
    displayUnit: s.displayUnit,
    context: s.context,
  }));

  try {
    // One request for every series — the endpoint takes a list of vectors.
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify(SERIES.map((s) => ({ vectorId: s.vectorId, latestN: PERIODS }))),
      next: { revalidate: REVALIDATE },
      signal: AbortSignal.timeout(25_000),
    });

    if (!response.ok) {
      return bases.map((b) => ({ ...b, history: [], error: `StatCan ${response.status}` }));
    }

    const payload = (await response.json()) as WdsResponse[];

    return SERIES.map((config, index) => {
      const base = bases[index]!;
      const entry = Array.isArray(payload)
        ? payload.find((p) => p.object?.vectorId === config.vectorId)
        : undefined;

      if (!entry || entry.status !== "SUCCESS") {
        return { ...base, history: [], error: `Vecteur ${config.vectorId} indisponible` };
      }

      const raw = (entry.object?.vectorDataPoint ?? [])
        .map((p) => ({
          period: String(p.refPer ?? "").slice(0, 7),
          value: Number(p.value),
        }))
        .filter((p) => /^\d{4}-\d{2}$/.test(p.period) && Number.isFinite(p.value))
        .sort((a, b) => (a.period < b.period ? -1 : 1));

      const history = transformPoints(raw, config.transform, config.scale ?? 1).filter(
        // Rates, and employment changes in thousands. Outside this band means
        // a raw level was stored where a transformed value belongs.
        (p) => p.value > -2000 && p.value < 2000,
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

/** True when StatCan is the source wired for this field. */
export function hasStatCanHistory(field: string): boolean {
  return SERIES.some((s) => s.field === field);
}

/** Full history for one CAD field — used by the indicator detail page's chart. */
export async function getStatCanHistory(field: string): Promise<StatCanSeriesResult | null> {
  const all = await fetchStatCanData();
  return all.find((r) => r.field === field) ?? null;
}
