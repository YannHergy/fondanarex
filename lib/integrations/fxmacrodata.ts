import "server-only";

import { createThrottle } from "@/lib/integrations/throttle";
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
 *     uncached. That endpoint is gone entirely — the differential is a
 *     subtraction between two policy rates we already hold. What remains is
 *     cached, with a revalidation window per resource reflecting how fast
 *     that data actually changes, and paced by the throttle below.
 *   - A missing key produced a 500 and an error banner. It now degrades: the
 *     screen renders without the FXMacroData panels and says so.
 */

const BASE = "https://fxmacrodata.com/api/v1";

/** Revalidation windows, in seconds. */
const TTL = {
  /** Session open/close countdowns are minute-scale by nature. */
  sessions: 60,
  riskSentiment: 15 * 60,
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
  // AUD only. `commodity_prices` is the RBA Commodity Price Index — the
  // official index of Australia's commodity exports, whose two largest
  // components are iron ore and coal, which is exactly what the `fer`
  // indicator scores. Every other currency 404s on this slug (tested):
  // there is no oil series for the CAD and no dairy series for the NZD, so
  // those two keep no source and stay flagged for manual entry.
  commodityPrice: "commodity_prices",
  // AUD, CAD and NZD only — the three profiles that weight an employment
  // CHANGE rather than the unemployment rate. The slug is `employment` (an
  // employed-population level), not `employment_change`, which 404s for every
  // currency; the move is derived from it in FIELD_EXTRACTORS.
  employmentChange: "employment",
};

export function hasIndicatorHistory(field: string): boolean {
  return field in HISTORY_SLUGS;
}

interface RawAnnouncement {
  date: string;
  val: number;
  pct_change_qoq?: number;
  pct_change_yoy?: number;
  change_from_previous?: number;
}

/**
 * Most `/announcements` slugs already report the number the scoring engine
 * (and the history chart) want in `val` — CPI, core CPI, unemployment and the
 * policy rate are all plain percentages or rates. Two are not, confirmed by
 * inspecting a live response rather than assuming the field name matched its
 * meaning:
 *
 *   - `gdp`'s `val` is the GDP LEVEL (chained dollars/local currency,
 *     e.g. 6067.65 for the USD), not a quarter-over-quarter change. The
 *     payload separately carries `pct_change_qoq` (e.g. 0.37), which is what
 *     `gdpQoQ` actually means here.
 *   - `trade_balance`'s `val` is in MILLIONS of the local currency
 *     (e.g. -77585 for the USD), while every other trade balance figure in
 *     this app — FRED's `transform: 'billions'`, the seeded MANUAL rows — is
 *     in billions. Left unconverted this is off by a factor of 1000.
 *   - `commodity_prices`'s `val` is an INDEX LEVEL (104.2), but the scoring
 *     engine reads `commodityPrice` as a percentage change saturating at
 *     ±15% (`pctScore(commodityPrice, 15)`), so the year-on-year change is
 *     what belongs in that field. The index level would score as permanent
 *     maximum bullishness.
 *
 * Extracting per-field like this, instead of reading `val` unconditionally,
 * is what avoids silently writing a GDP level into a field the scoring
 * engine treats as a small percentage.
 */
const FIELD_EXTRACTORS: Record<
  string,
  (point: RawAnnouncement, currency: CurrencyCode) => number | null
> = {
  gdpQoQ: (p) => (typeof p.pct_change_qoq === "number" ? p.pct_change_qoq : null),
  tradeBalance: (p) => (typeof p.val === "number" ? p.val / 1000 : null),
  commodityPrice: (p) => (typeof p.pct_change_yoy === "number" ? p.pct_change_yoy : null),

  // `employment`'s `val` is the employed-population LEVEL (14.8 million for
  // Australia), never what the engine wants. It wants the MOVE, and in two
  // different units depending on the country — scoreEmploymentChangeValue
  // reads thousands of jobs for the AUD/CAD (>50 is a very strong month),
  // while the NZD branch reads a quarterly percentage (pctScore(v, 1)),
  // because Stats NZ publishes it that way and the engine mirrors that.
  employmentChange: (p, currency) => {
    if (currency === "NZD") {
      return typeof p.pct_change_qoq === "number" ? p.pct_change_qoq : null;
    }
    return typeof p.change_from_previous === "number" ? p.change_from_previous / 1000 : null;
  },
};

function extractFieldValue(
  field: string,
  point: RawAnnouncement,
  currency: CurrencyCode,
): number | null {
  const extractor = FIELD_EXTRACTORS[field];
  if (extractor) return extractor(point, currency);
  return typeof point.val === "number" ? point.val : null;
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
  /** Direct link to the central bank's own publication of this release. */
  url: string | null;
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

export interface YieldCurve {
  points: YieldCurvePoint[];
  /**
   * Jour auquel la courbe se rapporte — PAS celui de la requête.
   *
   * L'API le renvoie depuis toujours (`as_of`, `data_quality.as_of`) et le
   * code le jetait, si bien que l'écran affichait « 2,81 % » sans dire de
   * quand datait ce 2,81 %. Or la BCE publie sa courbe les jours ouvrés et
   * FXMacroData accuse quelques jours de retard : un lundi matin, la valeur
   * affichée est celle du jeudi précédent. Sans la date, une donnée qui
   * bouge lentement est indiscernable d'une donnée figée — c'est exactement
   * la confusion que ce champ existe pour lever.
   */
  asOf: string | null;
  /** Écart en jours entre la donnée et aujourd'hui, tel que la source le calcule. */
  lagDays: number | null;
  /** Nom de la source réelle derrière l'agrégateur, ex. « ECB Yield Curve ». */
  sourceName: string | null;
  /** La source elle-même juge la donnée périmée (au-delà de son propre seuil). */
  isStale: boolean;
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
 * A page render fans out to several of these requests at once. When the key is
 * missing, expired or revoked, every one of them fails — and because only
 * successful responses are cached, they all fail again on the very next
 * render. That turns a billing problem into a multi-second page and a burst of
 * pointless upstream traffic.
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

/**
 * Étrangleur de débit — le mécanisme et la mesure qui l'a motivé sont dans
 * `throttle.ts`, qui est testé ; ici ne restent que les réglages.
 *
 * Le plafond est à six. L'API répond en ~3,8 s sous charge, donc un plafond
 * plus bas découpe les huit communiqués de la vue d'ensemble en vagues
 * successives : mesuré à quatre, seize requêtes prenaient 15,3 s et deux
 * mouraient sur le délai d'expiration. À six, l'éventail réel de cet écran —
 * neuf requêtes — passe en 5,2 s sans un seul rejet.
 *
 * Le 429 est en outre réessayé avec un délai croissant. Sans ce rattrapage il
 * n'était pas mis en cache — seules les réponses réussies le sont — et
 * repartait à l'identique au rendu suivant : la panne se réinstallait seule.
 */
const MAX_RETRIES = 2;

const throttle = createThrottle({
  maxConcurrent: 6,
  throttledGapMs: 300,
  throttleWindowMs: 60_000,
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `Retry-After` se présente soit en secondes, soit en date HTTP ; seul le
 * premier cas est exploitable ici. Le délai est plafonné : le rendu de la page
 * a son propre budget, et mieux vaut un panneau « indisponible » qu'une page
 * entière retenue par une source qui demande d'attendre une minute.
 */
function retryDelayMs(retryAfter: string | null, attempt: number): number {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 2_000);
  return 300 * 2 ** attempt;
}

/**
 * A 4xx from a plain lookup ("unsupported indicator") answers with `detail` as
 * a string. A 422 from a bad query parameter — the bug that motivated this —
 * answers with `detail` as an ARRAY of FastAPI validation objects
 * (`{type, loc, msg, ...}`), which `Error`'s constructor silently stringifies
 * to the useless "[object Object]" if passed directly. Both shapes are
 * normalised to a string here.
 */
function describeError(status: number, data: unknown): string {
  const rawDetail =
    data && typeof data === "object"
      ? ((data as { detail?: unknown; error?: unknown }).detail ??
        (data as { error?: unknown }).error)
      : null;

  if (typeof rawDetail === "string") return rawDetail;
  if (Array.isArray(rawDetail)) {
    return rawDetail
      .map((entry) =>
        entry && typeof entry === "object" && "msg" in entry
          ? String((entry as { msg: unknown }).msg)
          : JSON.stringify(entry),
      )
      .join("; ");
  }
  return `FXMacroData responded ${status}`;
}

async function fxFetch<T>(path: string, revalidate: number): Promise<T> {
  const key = process.env.FXMACRODATA_API_KEY ?? "";
  if (!key) throw new FxMacroDataError("FXMACRODATA_API_KEY is not configured");

  const separator = path.includes("?") ? "&" : "?";
  const url = `${BASE}${path}${separator}api_key=${encodeURIComponent(key)}`;

  for (let attempt = 0; ; attempt += 1) {
    // Relu à chaque tentative : une requête parallèle a pu faire sauter le
    // disjoncteur pendant que celle-ci patientait.
    if (breakerOpen()) {
      throw new FxMacroDataError(`FXMacroData unavailable: ${authFailureReason}`);
    }

    const { response, data } = await throttle.run(async () => {
      const res = await fetch(url, {
        next: { revalidate },
        // Without a deadline, one unresponsive upstream request holds the whole
        // page render open until the serverless function is killed, turning a
        // degraded panel into a failed page. Callers already treat a rejection
        // as "panel unavailable".
        //
        // Huit secondes, pas cinq. Mesuré le 2026-08-18 : l'API répond en
        // ~3,8 s sous charge, et deux requêtes parfaitement valides ont été
        // coupées à 5 s pendant le test. Chaque panneau ayant sa propre
        // frontière Suspense, une réponse lente arrive en différé au lieu de
        // retenir la page — le coût d'un délai plus long est donc faible,
        // celui d'un délai trop court est un panneau « indisponible » à tort.
        signal: AbortSignal.timeout(8_000),
      });
      // Le créneau reste tenu jusqu'à la lecture du corps : relâcher aux
      // en-têtes laisserait des transferts en cours hors du plafond.
      return { response: res, data: (await res.json().catch(() => null)) as unknown };
    });

    if (response.ok) return data as T;

    const message = describeError(response.status, data);

    // 401/403 means the key itself is bad — retrying cannot succeed, here or
    // in any of the sibling requests of this page render.
    if (response.status === 401 || response.status === 403) {
      tripBreaker(message);
      throw new FxMacroDataError(message);
    }

    if (response.status === 429) {
      // Espace les requêtes qui suivent, y compris celles déjà en attente
      // derrière le plafond : c'est tout l'éventail qui est de trop, pas
      // seulement celle-ci.
      throttle.engageBackoff();
      if (attempt < MAX_RETRIES) {
        await sleep(retryDelayMs(response.headers.get("retry-after"), attempt));
        continue;
      }
    }

    throw new FxMacroDataError(message);
  }
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

/**
 * Les différentiels de taux ne sont plus demandés à l'API.
 *
 * `/rate_differentials/{base}/{quote}` ne fournit qu'une soustraction entre
 * deux taux directeurs que l'application détient déjà, au prix de 56 requêtes
 * pour la matrice complète. Les deux appelants — la matrice carry de la vue
 * d'ensemble et le panneau de la page devise — la calculent désormais
 * eux-mêmes. Voir le commentaire de `CarryMatrix` pour le détail.
 */

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
  const payload = await fxFetch<{
    // The central bank's own domain, e.g. "https://www.ecb.europa.eu" — used
    // only when a specific release is missing its own `url`, which has not
    // been observed across any of the eight currencies but costs nothing to
    // guard against.
    source_url?: string;
    data?: Array<{ date: string; title: string; url?: string }>;
  }>(`/press-releases/${currency.toLowerCase()}?limit=10`, TTL.pressReleases);

  return (payload.data ?? []).map((p) => ({
    currency,
    title: p.title,
    date: p.date,
    url: p.url ?? payload.source_url ?? null,
  }));
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

export async function getYieldCurve(currency: CurrencyCode): Promise<YieldCurve> {
  const payload = await fxFetch<{
    data?: Array<{ maturity: string; val: number }>;
    as_of?: string;
    data_quality?: {
      latest_available_date?: string;
      data_lag_days?: number;
      source_name?: string;
      is_stale?: boolean;
    };
  }>(`/curves/${currency.toLowerCase()}`, TTL.yieldCurve);

  const quality = payload.data_quality;

  return {
    points: (payload.data ?? [])
      .filter((p) => ["2Y", "5Y", "10Y"].includes(p.maturity))
      .map((p) => ({ maturity: p.maturity, yieldPct: p.val })),
    asOf: payload.as_of ?? quality?.latest_available_date ?? null,
    lagDays: typeof quality?.data_lag_days === "number" ? quality.data_lag_days : null,
    sourceName: quality?.source_name ?? null,
    // On fait confiance au jugement de la source : elle connaît la cadence de
    // publication de chaque série (`stale_after_days`), là où un seuil choisi
    // ici traiterait une courbe quotidienne et un indice trimestriel pareil.
    isStale: quality?.is_stale === true,
  };
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
 * `limit` defaults to 100 — FXMacroData's `/announcements` endpoint hard-caps
 * it there (a value above 100 fails with HTTP 422, not a truncated result),
 * so for series with more history than that (USD's policy rate has 137
 * decisions since 1990, monthly CPI series run into the hundreds) only the
 * most recent 100 points are returned unless pagination via `offset` is
 * added later.
 */
export async function getIndicatorHistory(
  currency: CurrencyCode,
  field: string,
  limit = 100,
): Promise<IndicatorHistory> {
  const slug = HISTORY_SLUGS[field];
  if (!slug) throw new FxMacroDataError(`No FXMacroData slug for field "${field}"`);

  const payload = await fxFetch<{ name?: string; data?: RawAnnouncement[] }>(
    `/announcements/${currency.toLowerCase()}/${slug}?limit=${limit}`,
    TTL.history,
  );

  const points = (payload.data ?? [])
    .filter((d) => typeof d.date === "string")
    .map((d) => ({ date: d.date, value: extractFieldValue(field, d, currency) }))
    .filter((d): d is IndicatorHistoryPoint => d.value !== null)
    .reverse();

  return { name: payload.name ?? field, points };
}

export interface FxMacroDatapoint {
  current: number;
  previous: number;
  /** Period label of `current`, as a full date: "2026-07-15". */
  latestPeriod: string;
  /** Period label of `previous`, or null when only one observation exists. */
  previousPeriod: string | null;
  /** Expected date of the next publication, or null when FXMacroData has none queued. */
  nextRelease: string | null;
  /**
   * FXMacroData's own `data_quality.is_stale`, compared against each series'
   * expected cadence rather than a fixed window. Trusted over any check we
   * could run here: the GBP trade balance is published quarterly while the
   * provider expects it monthly, so it was 126 days old with a next release
   * still in the future — indistinguishable from fresh data from our side.
   */
  stale: boolean;
}

/**
 * The next scheduled publication for one indicator, from FXMacroData's own
 * forecast/calendar store rather than a guess derived from the last period
 * (a quarterly GDP print is not reliably "last period + 3 months" — meeting
 * dates and revisions shift it).
 */
async function fetchNextRelease(currency: CurrencyCode, field: string): Promise<string | null> {
  const slug = HISTORY_SLUGS[field];
  if (!slug) return null;

  const payload = await fxFetch<{
    data?: Array<{
      date: string;
      announcement_timing: string;
      announcement_datetime_local?: string;
    }>;
  }>(`/predictions/${currency.toLowerCase()}/${slug}`, TTL.predictions);

  const upcoming = (payload.data ?? []).find((d) => d.announcement_timing === "future");
  if (!upcoming) return null;

  // The full local timestamp when available ("2026-09-11T08:30:00-04:00"),
  // because the release HOUR is what an economic calendar is read for. The
  // bare date is only a fallback — it lands at midnight, which is never a real
  // publication time and is displayed as "heure inconnue" rather than 00:00.
  return upcoming.announcement_datetime_local ?? upcoming.date;
}

export interface FxMacroCoreResult {
  field: string;
  label: string;
  /** Currency code -> reading. Absent when that currency has no data for this field. */
  values: Partial<Record<CurrencyCode, FxMacroDatapoint>>;
  error: string | null;
}

/**
 * The scoring engine's core indicators that FXMacroData reliably covers for
 * all eight currencies: policy rate, CPI, core CPI, GDP and unemployment.
 * Trade balance is included too — it works for seven of eight (CHF has no
 * `trade_balance` slug, confirmed live) and that one gap simply leaves CHF's
 * existing value untouched rather than failing the whole field. Commodity
 * prices resolve for the AUD alone, which is the only currency whose profile
 * weights an iron-ore/coal indicator at all.
 *
 * PMI is deliberately absent: FXMacroData has no PMI slug for any currency
 * (see HISTORY_SLUGS), so it stays sourced from OECD/FRED as agreed.
 */
const CORE_FIELDS: ReadonlyArray<{ field: string; label: string }> = [
  { field: "interestRate", label: "Taux directeur" },
  { field: "cpi", label: "Inflation (CPI)" },
  { field: "coreCpi", label: "Inflation sous-jacente" },
  { field: "gdpQoQ", label: "PIB trimestriel" },
  { field: "unemployment", label: "Chômage" },
  { field: "tradeBalance", label: "Balance commerciale" },
  { field: "commodityPrice", label: "Matières premières" },
  { field: "employmentChange", label: "Emploi (variation)" },
];

async function fetchCorePoint(
  currency: CurrencyCode,
  field: string,
): Promise<FxMacroDatapoint | null> {
  const slug = HISTORY_SLUGS[field];
  if (!slug) return null;

  // Fired together: the current reading and the next-release date are
  // independent lookups, and a failure on the (best-effort) prediction call
  // must not lose the reading itself.
  const [payload, nextRelease] = await Promise.all([
    fxFetch<{ data?: RawAnnouncement[]; data_quality?: { is_stale?: boolean } }>(
      `/announcements/${currency.toLowerCase()}/${slug}?limit=2`,
      TTL.announcements,
    ),
    fetchNextRelease(currency, field).catch(() => null),
  ]);

  const points = (payload.data ?? [])
    .filter((d) => typeof d.date === "string")
    .map((d) => ({ date: d.date, value: extractFieldValue(field, d, currency) }))
    .filter((d): d is { date: string; value: number } => d.value !== null);

  const [latest, prior] = points;
  if (!latest) return null;

  return {
    current: latest.value,
    previous: prior?.value ?? latest.value,
    latestPeriod: latest.date,
    previousPeriod: prior?.date ?? null,
    nextRelease,
    stale: payload.data_quality?.is_stale === true,
  };
}

/**
 * Fetches the core dataset for every currency, ONE FIELD AT A TIME.
 *
 * Sequential across fields on purpose. Each field fans out to 8 currencies ×
 * 2 requests (the reading and its next-release date), and firing all fields
 * together put 112 requests in flight at once — past the 5-second deadline in
 * fxFetch, so the last fields to resolve lost their next-release date
 * silently (10 of 46 rows came back without one, concentrated on the last two
 * fields in this list, which is what gave the game away). Sixteen concurrent
 * requests per step is well inside that budget.
 *
 * A missing currency for a field (CHF trade balance, the CAD/NZD commodity
 * series, or any currency during an outage) resolves to that currency simply
 * being absent from `values` — never a zero, so the write step below leaves
 * the existing row alone instead of overwriting real data with a false
 * reading.
 */
export async function fetchAllFxMacroCoreData(): Promise<FxMacroCoreResult[]> {
  const results: FxMacroCoreResult[] = [];

  for (const { field, label } of CORE_FIELDS) {
    const settled = await Promise.allSettled(
      CURRENCY_CODES.map(
        async (currency) => [currency, await fetchCorePoint(currency, field)] as const,
      ),
    );

    const values: Partial<Record<CurrencyCode, FxMacroDatapoint>> = {};
    let succeeded = false;
    let lastError: string | null = null;

    for (const result of settled) {
      if (result.status === "fulfilled") {
        const [currency, point] = result.value;
        if (point) {
          values[currency] = point;
          succeeded = true;
        }
      } else {
        lastError = result.reason instanceof Error ? result.reason.message : String(result.reason);
      }
    }

    results.push({ field, label, values, error: succeeded ? null : lastError });
  }

  return results;
}

// ── China ──────────────────────────────────────────────────────────────────

/**
 * The Chinese series FXMacroData actually publishes, verified live.
 *
 * `cny` is not one of the eight tracked currencies, so none of the machinery
 * above applies to it — no CurrencyCode, no CORE_FIELDS, no writes to a
 * currency row. China enters this app as a market-context input for the AUD
 * and NZD, and nothing else.
 *
 * Absent for `cny`, tested rather than assumed: pmi, manufacturing_pmi,
 * industrial_production, exports, imports, trade_balance, credit,
 * money_supply, wages — all 404. That is why the composite in
 * domain/china/demand.ts exists at all.
 */
const CHINA_SLUGS = {
  retailSales: "retail_sales",
  cpi: "inflation",
  unemployment: "unemployment",
  policyRate: "policy_rate",
  gdp: "gdp",
} as const;

/** The two most recent readings of one Chinese series, newest first. */
async function chinaSeries(slug: string): Promise<RawAnnouncement[]> {
  const payload = await fxFetch<{ data?: RawAnnouncement[] }>(
    `/announcements/cny/${slug}?limit=2`,
    TTL.announcements,
  );
  return (payload.data ?? []).filter((d) => typeof d.val === "number");
}

export interface ChinaReadings {
  /** Index 0 is the newest reading, index 1 the one before it. */
  retailSales: (number | null)[];
  cpi: (number | null)[];
  unemployment: (number | null)[];
  policyRate: (number | null)[];
  /** Year-on-year growth, newest first. Already filtered for sanity. */
  gdpYoY: (number | null)[];
  /** Period of the newest retail-sales reading, the fastest-moving series. */
  latestPeriod: string | null;
}

/**
 * Pulls every Chinese series the composite needs, in one fan-out.
 *
 * Two readings of each, because the index is published alongside its previous
 * value: `scoreChinaLevel` scores the LEVEL and then adds a momentum term, so
 * an index without a predecessor loses half of what it is scored on.
 *
 * A series that fails resolves to nulls rather than rejecting. Losing the
 * unemployment rate should cost 15% of the composite's coverage, not the
 * composite.
 */
export async function fetchChinaReadings(): Promise<ChinaReadings> {
  const entries = Object.entries(CHINA_SLUGS) as Array<
    [keyof typeof CHINA_SLUGS, string]
  >;

  const settled = await Promise.allSettled(
    entries.map(async ([key, slug]) => [key, await chinaSeries(slug)] as const),
  );

  const byKey = new Map<string, RawAnnouncement[]>();
  for (const result of settled) {
    if (result.status === "fulfilled") byKey.set(result.value[0], result.value[1]);
  }

  const values = (key: string): (number | null)[] => {
    const series = byKey.get(key) ?? [];
    return [series[0]?.val ?? null, series[1]?.val ?? null];
  };

  // GDP is read from `pct_change_yoy`, never from `val`: `val` is a cumulative
  // level in hundreds of millions of yuan. The caller applies `saneGdpGrowth`
  // on top, because even the yoy field breaks on China's cumulative reporting.
  const gdp = byKey.get("gdp") ?? [];

  return {
    retailSales: values("retailSales"),
    cpi: values("cpi"),
    unemployment: values("unemployment"),
    policyRate: values("policyRate"),
    gdpYoY: [gdp[0]?.pct_change_yoy ?? null, gdp[1]?.pct_change_yoy ?? null],
    latestPeriod: byKey.get("retailSales")?.[0]?.date ?? null,
  };
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
