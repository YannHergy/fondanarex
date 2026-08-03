import "server-only";

import { CURRENCY_CODES, type CurrencyCode } from "@/lib/utils";

/**
 * FXMacroData — cross-market data behind the "Vue d'ensemble" screen.
 *
 * The legacy app reached this API through `api/fxmacrodata.ts`, a Vercel
 * function that existed purely to keep the key off the client, and then a
 * browser-side `marketData.ts` that called it. Server components remove the
 * middle layer entirely: this module is imported directly by the page, the key
 * never leaves the server, and there is no proxy endpoint to secure.
 *
 * Two problems from the old implementation are fixed here:
 *
 *   - `getAllRateDifferentials` fired 56 requests on every single page view,
 *     uncached. Responses are cached now, with a revalidation window per
 *     resource reflecting how fast that data actually changes.
 *   - A missing key produced a 500 and an error banner. It now degrades: the
 *     screen renders without the FXMacroData panels and says so.
 */

const BASE = "https://fxmacrodata.com/api/v1";

/** Revalidation windows, in seconds. */
const TTL = {
  /** Session open/close countdowns are minute-scale by nature. */
  sessions: 60,
  riskSentiment: 15 * 60,
  rateDifferentials: 6 * 60 * 60,
  calendar: 60 * 60,
  announcements: 30 * 60,
  pressReleases: 60 * 60,
  predictions: 60 * 60,
  yieldCurve: 6 * 60 * 60,
  cot: 12 * 60 * 60,
  history: 60 * 60,
} as const;

/**
 * CurrencyData field -> FXMacroData announcement slug.
 *
 * Verified live against the real API (not guessed): every slug here returned
 * a real, decades-deep series. PMI (manufacturing and services) has no
 * FXMacroData slug at all — tested a dozen plausible names, all 404 — so it
 * is deliberately absent rather than pointing at a broken link.
 */
const HISTORY_SLUGS: Record<string, string> = {
  interestRate: "policy_rate",
  cpi: "inflation",
  coreCpi: "core_inflation",
  gdpQoQ: "gdp",
  unemployment: "unemployment",
  wagePPI: "wages",
  tradeBalance: "trade_balance",
  retailSales: "retail_sales",
};

export function hasIndicatorHistory(field: string): boolean {
  return field in HISTORY_SLUGS;
}

export interface RiskSentiment {
  status: "Risk On" | "Risk Off";
  score: number;
  updatedAt: string;
}

export interface FxSession {
  name: string;
  isOpen: boolean;
  opensInMin?: number;
  closesInMin?: number;
}

export interface RateDifferential {
  base: CurrencyCode;
  quote: CurrencyCode;
  differentialPct: number;
}

export interface CalendarEntry {
  date: string;
  time: string;
  currency: CurrencyCode;
  indicator: string;
  importance?: string;
}

export interface AnnouncementEntry {
  currency: CurrencyCode;
  indicator: string;
  actual: string;
  previous: string;
  publishedAt: string;
}

export interface PressRelease {
  currency: CurrencyCode;
  title: string;
  date: string;
}

export interface ConsensusPrediction {
  currency: CurrencyCode;
  indicator: string;
  consensus: string;
}

export interface YieldCurvePoint {
  maturity: string;
  yieldPct: number;
}

export interface CotPositioning {
  currency: CurrencyCode;
  longPct: number;
  shortPct: number;
  netPosition: number;
  updatedAt: string;
}

export function isConfigured(): boolean {
  return (process.env.FXMACRODATA_API_KEY ?? "").length > 0;
}

class FxMacroDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FxMacroDataError";
  }
}

/**
 * Circuit breaker for authentication failures.
 *
 * The overview screen fans out to more than 70 requests (56 of them for the
 * carry matrix alone). When the key is missing, expired or revoked, every one
 * of those fails — and because only successful responses are cached, they all
 * fail again on the very next render. That turns a billing problem into a
 * multi-second page and a burst of pointless upstream traffic.
 *
 * A 401/403 trips the breaker: subsequent calls fail instantly for a cooldown
 * window instead of going out. Only auth failures trip it — a timeout or a 500
 * is transient and must stay retryable.
 */
const AUTH_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
let authFailedUntil = 0;
let authFailureReason = "";

function breakerOpen(): boolean {
  return Date.now() < authFailedUntil;
}

function tripBreaker(reason: string): void {
  authFailedUntil = Date.now() + AUTH_FAILURE_COOLDOWN_MS;
  authFailureReason = reason;
}

async function fxFetch<T>(path: string, revalidate: number): Promise<T> {
  const key = process.env.FXMACRODATA_API_KEY ?? "";
  if (!key) throw new FxMacroDataError("FXMACRODATA_API_KEY is not configured");

  if (breakerOpen()) {
    throw new FxMacroDataError(`FXMacroData unavailable: ${authFailureReason}`);
  }

  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${BASE}${path}${separator}api_key=${encodeURIComponent(key)}`, {
    next: { revalidate },
    // The overview screen fans out to 70+ of these. Without a deadline, one
    // unresponsive upstream request holds the whole page render open until the
    // serverless function is killed, turning a degraded panel into a failed
    // page. Callers already treat a rejection as "panel unavailable".
    signal: AbortSignal.timeout(5_000),
  });

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      data && typeof data === "object"
        ? ((data as { detail?: string; error?: string }).detail ??
          (data as { error?: string }).error)
        : null;
    const message = detail ?? `FXMacroData responded ${response.status}`;

    // 401/403 means the key itself is bad — retrying the other 69 requests of
    // this page render cannot succeed.
    if (response.status === 401 || response.status === 403) {
      tripBreaker(message);
    }

    throw new FxMacroDataError(message);
  }
  return data as T;
}

// ── Resources ──────────────────────────────────────────────────────────────

export async function getRiskSentiment(): Promise<RiskSentiment> {
  const payload = await fxFetch<{ data?: Array<{ regime: string; score: number; date: string }> }>(
    "/risk_sentiment?limit=1",
    TTL.riskSentiment,
  );
  const latest = payload.data?.[0];
  return {
    status: latest?.regime === "risk_off" ? "Risk Off" : "Risk On",
    score: latest?.score ?? 0,
    updatedAt: latest?.date ?? new Date().toISOString(),
  };
}

const SESSION_LABELS: Record<string, string> = {
  Sydney: "Sydney",
  Tokyo: "Tokyo",
  London: "Londres",
  "New York": "New York",
};

export async function getSessions(): Promise<FxSession[]> {
  const payload = await fxFetch<{
    sessions?: Array<{
      name: string;
      is_open: boolean;
      seconds_to_open: number | null;
      seconds_to_close: number | null;
    }>;
  }>("/market_sessions", TTL.sessions);

  return (payload.sessions ?? []).map((s) => ({
    name: SESSION_LABELS[s.name] ?? s.name,
    isOpen: s.is_open,
    opensInMin: s.seconds_to_open != null ? Math.round(s.seconds_to_open / 60) : undefined,
    closesInMin: s.seconds_to_close != null ? Math.round(s.seconds_to_close / 60) : undefined,
  }));
}

async function getRateDifferential(
  base: CurrencyCode,
  quote: CurrencyCode,
): Promise<RateDifferential> {
  const payload = await fxFetch<{ latest_differential?: number }>(
    `/rate_differentials/${base.toLowerCase()}/${quote.toLowerCase()}`,
    TTL.rateDifferentials,
  );
  return { base, quote, differentialPct: payload.latest_differential ?? 0 };
}

/**
 * The full 8×8 differential matrix.
 *
 * This is 56 upstream requests. They are cached for six hours — policy-rate
 * differentials do not move faster than that — so the fan-out happens once per
 * window rather than once per page view as it did before.
 */
export async function getRateDifferentials(): Promise<RateDifferential[]> {
  const pairs: Array<[CurrencyCode, CurrencyCode]> = [];
  for (const base of CURRENCY_CODES) {
    for (const quote of CURRENCY_CODES) {
      if (base !== quote) pairs.push([base, quote]);
    }
  }

  const settled = await Promise.allSettled(
    pairs.map(([base, quote]) => getRateDifferential(base, quote)),
  );

  // A partial matrix is more useful than an error: the cells that resolved are
  // still correct, and the rest render as zero.
  return settled
    .filter((r): r is PromiseFulfilledResult<RateDifferential> => r.status === "fulfilled")
    .map((r) => r.value);
}

export async function getCalendar(currency: CurrencyCode): Promise<CalendarEntry[]> {
  const payload = await fxFetch<{
    data?: Array<{ name: string; announcement_datetime_local: string; event_importance: string }>;
  }>(`/calendar/${currency.toLowerCase()}?limit=6`, TTL.calendar);

  return (payload.data ?? []).slice(0, 6).map((e) => {
    const [date, time] = (e.announcement_datetime_local ?? "").split("T");
    return {
      date: date ?? "",
      time: (time ?? "").slice(0, 5),
      currency,
      indicator: e.name,
      importance: e.event_importance,
    };
  });
}

const HEADLINE_SLUGS = ["inflation", "gdp", "unemployment"] as const;

export async function getLatestAnnouncements(
  currency: CurrencyCode,
): Promise<AnnouncementEntry[]> {
  const settled = await Promise.allSettled(
    HEADLINE_SLUGS.map((slug) =>
      fxFetch<{ name?: string; data?: Array<{ date: string; val: number; previous_value: number }> }>(
        `/announcements/${currency.toLowerCase()}/${slug}?limit=1`,
        TTL.announcements,
      ).then((payload) => ({ slug, payload })),
    ),
  );

  const out: AnnouncementEntry[] = [];
  for (const result of settled) {
    // Not every indicator exists for every currency; a 404 on one slug is
    // expected and must not lose the other two.
    if (result.status !== "fulfilled") continue;
    const latest = result.value.payload.data?.[0];
    if (!latest) continue;
    out.push({
      currency,
      indicator: result.value.payload.name ?? result.value.slug,
      actual: String(latest.val),
      previous: String(latest.previous_value),
      publishedAt: latest.date,
    });
  }
  return out;
}

export async function getPressReleases(currency: CurrencyCode): Promise<PressRelease[]> {
  const payload = await fxFetch<{ data?: Array<{ date: string; title: string }> }>(
    `/press-releases/${currency.toLowerCase()}?limit=10`,
    TTL.pressReleases,
  );
  return (payload.data ?? []).map((p) => ({ currency, title: p.title, date: p.date }));
}

export async function getAllPressReleases(): Promise<PressRelease[]> {
  const settled = await Promise.allSettled(CURRENCY_CODES.map((c) => getPressReleases(c)));
  return settled
    .filter((r): r is PromiseFulfilledResult<PressRelease[]> => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function getPrediction(
  currency: CurrencyCode,
  indicator: string,
): Promise<ConsensusPrediction> {
  const payload = await fxFetch<{
    data?: Array<{
      announcement_timing: string;
      predictions?: Array<{ predicted_value: number; prediction_source: string }>;
    }>;
  }>(`/predictions/${currency.toLowerCase()}/${indicator}`, TTL.predictions);

  const upcoming = payload.data?.find((x) => x.announcement_timing === "future") ?? payload.data?.[0];
  const blended =
    upcoming?.predictions?.find((p) => p.prediction_source === "fxmacrodata_blended") ??
    upcoming?.predictions?.[0];

  return { currency, indicator, consensus: blended ? String(blended.predicted_value) : "—" };
}

export async function getYieldCurve(currency: CurrencyCode): Promise<YieldCurvePoint[]> {
  const payload = await fxFetch<{ data?: Array<{ maturity: string; val: number }> }>(
    `/curves/${currency.toLowerCase()}`,
    TTL.yieldCurve,
  );
  return (payload.data ?? [])
    .filter((p) => ["2Y", "5Y", "10Y"].includes(p.maturity))
    .map((p) => ({ maturity: p.maturity, yieldPct: p.val }));
}

export interface IndicatorHistoryPoint {
  date: string;
  value: number;
}

export interface IndicatorHistory {
  name: string;
  points: IndicatorHistoryPoint[];
}

/**
 * Full history for one indicator, oldest first (the API itself returns
 * newest first — reversed here so a chart can draw left-to-right without
 * its caller having to remember which way this particular endpoint sorts).
 *
 * `limit` is generous by default: USD's policy rate alone has 137 decisions
 * since 1990, and monthly CPI series run into the hundreds of points.
 */
export async function getIndicatorHistory(
  currency: CurrencyCode,
  field: string,
  limit = 500,
): Promise<IndicatorHistory> {
  const slug = HISTORY_SLUGS[field];
  if (!slug) throw new FxMacroDataError(`No FXMacroData slug for field "${field}"`);

  const payload = await fxFetch<{ name?: string; data?: Array<{ date: string; val: number }> }>(
    `/announcements/${currency.toLowerCase()}/${slug}?limit=${limit}`,
    TTL.history,
  );

  const points = (payload.data ?? [])
    .filter((d) => typeof d.val === "number" && typeof d.date === "string")
    .map((d) => ({ date: d.date, value: d.val }))
    .reverse();

  return { name: payload.name ?? field, points };
}

export async function getCOT(currency: CurrencyCode): Promise<CotPositioning> {
  const payload = await fxFetch<{
    data?: Array<{
      date: string;
      noncommercial_long: number;
      noncommercial_short: number;
      noncommercial_net: number;
    }>;
  }>(`/cot/${currency.toLowerCase()}?limit=1`, TTL.cot);

  const latest = payload.data?.[0];
  if (!latest) {
    return { currency, longPct: 50, shortPct: 50, netPosition: 0, updatedAt: "" };
  }

  const total = latest.noncommercial_long + latest.noncommercial_short;
  const longPct = total > 0 ? Math.round((latest.noncommercial_long / total) * 100) : 50;
  return {
    currency,
    longPct,
    shortPct: 100 - longPct,
    netPosition: latest.noncommercial_net,
    updatedAt: latest.date,
  };
}
