import "server-only";

import { toVixReading, type VixDailyClose, type VixReading } from "@/domain/macro/vix";

/**
 * CBOE Volatility Index, via Yahoo Finance.
 *
 * Why not TradingView: it publishes embeddable widgets, not a data API. A
 * widget is an iframe on another origin, so the browser will not let us read
 * the number out of it, and scraping the site is against its terms. Yahoo
 * serves the same index — the response identifies it as "Cboe Indices",
 * because the VIX has exactly one publisher and everyone redistributes that
 * single figure.
 *
 * Why not FRED, which also carries it as VIXCLS: FRED needs an API key that
 * is not configured (every refresh reports "FRED: clé API absente"), and its
 * series lags the market by a day. This endpoint needs no key. If a FRED key
 * is ever added, VIXCLS is the more durable source and this can move there —
 * `domain/macro/vix.ts` holds the logic and would not change.
 */

const CHART_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=3mo";

/** 12 hours: the VIX prints once a session, and the score reads a monthly close. */
const REVALIDATE = 12 * 60 * 60;

interface YahooChart {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
    error?: { description?: string } | null;
  };
}

export class VixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VixError";
  }
}

function isoDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

export async function fetchVix(): Promise<VixReading> {
  const response = await fetch(CHART_URL, {
    // Yahoo answers 429 to a request with no User-Agent.
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Fondanarex/1.0)" },
    next: { revalidate: REVALIDATE },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new VixError(`Yahoo Finance responded ${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as YahooChart | null;
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;

  if (!timestamps || !closes || timestamps.length === 0) {
    const detail = payload?.chart?.error?.description ?? "réponse vide ou inattendue";
    throw new VixError(`VIX indisponible : ${detail}`);
  }

  const daily: VixDailyClose[] = [];
  for (const [i, ts] of timestamps.entries()) {
    const close = closes[i];
    // Holidays inside the range come back as null; skipped rather than zeroed,
    // because a VIX of 0 would read as total market calm.
    if (typeof close !== "number" || !Number.isFinite(close)) continue;
    daily.push({ date: isoDate(ts), close });
  }

  const reading = toVixReading(daily);
  if (!reading) throw new VixError("VIX indisponible : aucune séance exploitable");

  return reading;
}
