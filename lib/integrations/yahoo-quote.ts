import "server-only";

import { toMonthlyReading, type DailyClose, type MonthlyReading } from "@/domain/macro/market-series";

/**
 * Daily closes of a continuously-quoted symbol, via Yahoo Finance.
 *
 * Shared by the VIX and the oil barrel: both are market prices rather than
 * statistical releases, and both are reduced to one point per month before
 * being stored (see market-series.ts).
 *
 * Why not TradingView: it publishes embeddable widgets, not a data API. A
 * widget is an iframe on another origin, so the browser will not let us read
 * the number out of it, and scraping the site is against its terms. Yahoo
 * serves the same figures — the VIX response identifies itself as "Cboe
 * Indices", because these instruments have one publisher and everyone
 * redistributes that single quote.
 */

/** 12 hours: these print once a session, and the score reads a monthly close. */
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

export class YahooQuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YahooQuoteError";
  }
}

function isoDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * @param symbol Yahoo ticker, e.g. "^VIX" or "CL=F". Encoded here, so callers
 *   pass it in its natural form.
 * @param range Yahoo range token. Three months is enough to always cover the
 *   current month and the one before it, including a long holiday gap.
 */
export async function fetchDailyCloses(symbol: string, range = "3mo"): Promise<DailyClose[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;

  const response = await fetch(url, {
    // Yahoo answers 429 to a request with no User-Agent.
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Fondanarex/1.0)" },
    next: { revalidate: REVALIDATE },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new YahooQuoteError(`Yahoo Finance a répondu ${response.status} pour ${symbol}`);
  }

  const payload = (await response.json().catch(() => null)) as YahooChart | null;
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;

  if (!timestamps || !closes || timestamps.length === 0) {
    const detail = payload?.chart?.error?.description ?? "réponse vide ou inattendue";
    throw new YahooQuoteError(`${symbol} indisponible : ${detail}`);
  }

  const daily: DailyClose[] = [];
  for (const [i, ts] of timestamps.entries()) {
    const close = closes[i];
    // Holidays inside the range come back as null; skipped rather than zeroed,
    // because a barrel or a VIX at 0 would read as an extreme, not as missing.
    if (typeof close !== "number" || !Number.isFinite(close)) continue;
    daily.push({ date: isoDate(ts), close });
  }

  if (daily.length === 0) {
    throw new YahooQuoteError(`${symbol} indisponible : aucune séance exploitable`);
  }

  return daily;
}

/**
 * The same request, reduced to the latest month-end close and the one before.
 *
 * Kept as the entry point for everything that stores a monthly row. Callers
 * needing the shape of the series itself — a trailing window rather than a
 * calendar month — use `fetchDailyCloses` and reduce it themselves.
 */
export async function fetchMonthlyQuote(
  symbol: string,
  range = "3mo",
): Promise<MonthlyReading> {
  const daily = await fetchDailyCloses(symbol, range);

  const reading = toMonthlyReading(daily);
  if (!reading) throw new YahooQuoteError(`${symbol} indisponible : aucune séance exploitable`);

  return reading;
}
