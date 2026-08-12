import "server-only";

/**
 * Bank of Japan — Time-Series Data Search API (launched February 2026).
 *
 * No key, no registration; JSON/CSV responses at
 * stat-search.boj.or.jp/api/v1. Covers the two JPY fields that had no direct
 * central-bank/government source before: the policy rate (the Uncollateralized
 * Overnight Call Rate, BoJ's actual operational target since it exited YCC)
 * and the current account (Balance of Payments, compiled jointly by the BoJ
 * and the Ministry of Finance — the "compte courant" the jp_balance indicator
 * prefers over the plain trade balance, per domain/market-context/scorers.ts).
 *
 * IMPORTANT — verified quirk: the `getDataLayer` endpoint does NOT clamp a
 * requested date range to the series' real coverage. Queried past the true
 * end of data it returns plausible-looking non-null numbers (checked: BP01's
 * BPBP6JYNCB claims END_OF_THE_TIME_SERIES=202606 in its own metadata, yet
 * `getDataLayer` served numeric values through 202509 — three months of data
 * that do not exist). A window six+ months out DOES correctly return `null`,
 * so this isn't simple non-validation, just a wider grace window than the
 * metadata admits to. Every fetch here therefore reads getMetadata FIRST and
 * discards any row past the series' own declared end — never trust getDataLayer's
 * date bound alone.
 */

const BASE = "https://www.stat-search.boj.or.jp/api/v1";
const REVALIDATE = 12 * 60 * 60;
const HISTORY_SINCE = "2015-01";

export interface BojPoint {
  /** "2026-06" */
  period: string;
  value: number;
}

export interface BojSeriesResult {
  field: "interestRate" | "tradeBalance";
  label: string;
  displayUnit: string;
  context: string | null;
  history: BojPoint[];
  error: string | null;
}

function toStartParam(period: string): string {
  return period.replace("-", "");
}

function toEndParam(): string {
  const now = new Date();
  // A little slack past "this month" so a mid-month release lands without a
  // redeploy; getMetadata still bounds what actually gets kept.
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The series' own declared last period ("202606"), read from getMetadata. Null if not found. */
async function fetchSeriesEnd(db: string, seriesCode: string): Promise<string | null> {
  const url = `${BASE}/getMetadata?format=csv&lang=en&db=${db}`;
  const response = await fetch(url, {
    next: { revalidate: REVALIDATE },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  const text = await response.text();
  for (const line of text.split("\n")) {
    const cols = line.split(",");
    if (cols[0] !== seriesCode) continue;
    // Same quoted-name issue as fetchSeries: read from the end of the row
    // (NOTES, LAST_UPDATE, END_OF_THE_TIME_SERIES, ...) rather than a fixed
    // forward index.
    return cols[cols.length - 3]?.trim() || null; // END_OF_THE_TIME_SERIES
  }
  return null;
}

async function fetchSeries(
  db: string,
  seriesCode: string,
  layer: string,
): Promise<{ history: BojPoint[]; error: string | null }> {
  const seriesEnd = await fetchSeriesEnd(db, seriesCode);
  if (!seriesEnd) {
    return { history: [], error: `${seriesCode}: introuvable dans les métadonnées BoJ` };
  }

  const url = `${BASE}/getDataLayer?format=csv&lang=en&db=${db}&frequency=M&startDate=${toStartParam(HISTORY_SINCE)}&endDate=${toEndParam()}&layer=${layer}`;
  const response = await fetch(url, {
    next: { revalidate: REVALIDATE },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    return { history: [], error: `BoJ ${response.status}` };
  }

  const text = await response.text();
  const history: BojPoint[] = [];
  for (const line of text.split("\n")) {
    const cols = line.split(",");
    if (cols[0] !== seriesCode) continue;
    // NAME_OF_TIME_SERIES (column 2) is quoted BECAUSE some names embed a
    // comma (e.g. "Call Rate, Uncollateralized Overnight/Average"), which
    // shifts every fixed forward index. VALUES and SURVEY_DATES are always
    // comma-plain and last, so read from the end of the row instead.
    const survey = cols[cols.length - 2]?.trim(); // SURVEY_DATES, "YYYYMM"
    const raw = cols[cols.length - 1]?.trim(); // VALUES
    if (!survey || !/^\d{6}$/.test(survey) || survey > seriesEnd) continue;
    if (!raw || raw === "null") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    history.push({ period: `${survey.slice(0, 4)}-${survey.slice(4, 6)}`, value });
  }
  history.sort((a, b) => (a.period < b.period ? -1 : 1));

  if (history.length === 0) {
    return { history: [], error: "Aucune valeur exploitable" };
  }
  return { history, error: null };
}

const RATE_CONTEXT =
  "Le taux du marché interbancaire au jour le jour, non collatéralisé, est l'objectif opérationnel de la BoJ depuis la sortie du contrôle de la courbe des taux (YCC) — il tourne quelques points de base sous la cible affichée, ce qui est normal.";

/** Uncollateralized overnight call rate, monthly average — the BoJ's actual policy target since exiting YCC. */
export async function fetchBojRateData(): Promise<BojSeriesResult[]> {
  const { history, error } = await fetchSeries("FM02", "STRACLUCON", "1,4");
  return [
    {
      field: "interestRate",
      label: "Taux au jour le jour non collatéralisé (moyenne mensuelle)",
      displayUnit: "%",
      context: RATE_CONTEXT,
      history,
      error,
    },
  ];
}

const TRADE_CONTEXT =
  "Balance des biens et services, compilée par la BoJ pour le compte du ministère des Finances — la composante commerciale du compte courant.";

/** Goods & services net balance — the trade-balance component of the current account. */
export async function fetchBojTradeBalanceData(): Promise<BojSeriesResult[]> {
  const { history, error } = await fetchSeries("BP01", "BPBP6JYNTS", "1,1,1,2,1");
  // 100 million yen -> billions of yen, matching the unit every other
  // currency's tradeBalance is stored in (see fxmacrodata.ts's /1000 on a
  // millions-denominated feed).
  const scaled = history.map((p) => ({ period: p.period, value: p.value / 10 }));
  return [
    {
      field: "tradeBalance",
      label: "Balance commerciale (biens & services)",
      displayUnit: "Mds ¥",
      context: TRADE_CONTEXT,
      history: scaled,
      error,
    },
  ];
}

export interface BojCurrentAccountResult {
  label: string;
  displayUnit: string;
  context: string | null;
  history: BojPoint[];
  error: string | null;
}

const CURRENT_ACCOUNT_CONTEXT =
  "L'excédent structurel du compte courant japonais — porté par les rapatriements de revenus d'investissements à l'étranger, pas seulement le commerce — est un soutien structurel au yen.";

/** Current account net balance (BPM6) — what jp_balance actually scores when available. */
export async function fetchBojCurrentAccountData(): Promise<BojCurrentAccountResult> {
  const { history, error } = await fetchSeries("BP01", "BPBP6JYNCB", "1,1,1,1,1");
  const scaled = history.map((p) => ({ period: p.period, value: p.value / 10 }));
  return {
    label: "Compte courant (solde net)",
    displayUnit: "Mds ¥",
    context: CURRENT_ACCOUNT_CONTEXT,
    history: scaled,
    error,
  };
}

/** True when the BoJ is the source wired for this JPY field. */
export function hasBojHistory(field: string): boolean {
  return field === "interestRate" || field === "tradeBalance";
}

export async function getBojHistory(field: string): Promise<BojSeriesResult | null> {
  if (!hasBojHistory(field)) return null;
  const [result] =
    field === "interestRate" ? await fetchBojRateData() : await fetchBojTradeBalanceData();
  return result ?? null;
}
