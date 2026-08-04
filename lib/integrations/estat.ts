import "server-only";

import {
  TOKYO_CPI_INDICATOR,
  TOKYO_REGION,
  parseEstatPoints,
  toEstatReading,
  type EstatReading,
} from "@/domain/macro/estat";

/**
 * Statistics Dashboard — Statistics Bureau of Japan.
 *
 * Supplies the Tokyo CPI, worth 12% of the JPY profile and previously without
 * any source. No API key and no registration; the data is under the Public
 * Data License 1.0, which permits commercial reuse. The two required credits
 * live in domain/macro/estat.ts and are rendered on the Méthodologie page.
 *
 * Tokyo publishes two to three weeks ahead of the national CPI, which is
 * exactly why the profile weights it: it leads the national print.
 */

const BASE = "https://dashboard.e-stat.go.jp/api/1.0/Json/getData";

/** 12 hours — this is a monthly release, not a quote. */
const REVALIDATE = 12 * 60 * 60;

export class EstatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EstatError";
  }
}

export async function fetchTokyoCpi(): Promise<EstatReading> {
  // `Cycle=1` is monthly. RegionCode narrows the response to Tokyo — without
  // it the API returns every municipality in Japan, tens of thousands of
  // points. Note that adding `TimeFrom` makes the endpoint answer with an HTML
  // error page instead of JSON, so the series is trimmed on our side.
  const url = `${BASE}?Lang=EN&IndicatorCode=${TOKYO_CPI_INDICATOR}&RegionCode=${TOKYO_REGION}&Cycle=1`;

  const response = await fetch(url, {
    next: { revalidate: REVALIDATE },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new EstatError(`Statistics Dashboard a répondu ${response.status}`);
  }

  // On a bad parameter this API serves an HTML error page with a 200 status,
  // so a parse failure is treated as an error rather than as empty data.
  const payload: unknown = await response.json().catch(() => null);
  if (payload === null) {
    throw new EstatError("Statistics Dashboard : réponse non exploitable (HTML au lieu de JSON)");
  }

  const points = parseEstatPoints(payload, TOKYO_REGION);
  const reading = toEstatReading(points);
  if (!reading) throw new EstatError("CPI Tokyo indisponible : aucun point exploitable");

  return reading;
}
