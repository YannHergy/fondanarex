import "server-only";

import {
  FRED_SERIES,
  applyTransform,
  type FredDatapoint,
  type FredObservation,
} from "@/domain/macro/fred";

/**
 * FRED — Federal Reserve Bank of St. Louis.
 *
 * US-only, and more precise than the OECD for several US series (annualised
 * GDP, the effective Fed Funds rate, average hourly earnings). It therefore
 * takes precedence over the OECD for the USD; every other currency comes from
 * the OECD alone.
 */

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export function isConfigured(): boolean {
  return (process.env.FRED_API_KEY ?? "").length > 0;
}

export interface FredSeriesResult {
  field: string;
  seriesId: string;
  value: FredDatapoint | null;
  error: string | null;
}

async function fetchSeries(config: (typeof FRED_SERIES)[number]): Promise<FredSeriesResult> {
  const base = { field: config.field, seriesId: config.seriesId };
  const key = process.env.FRED_API_KEY ?? "";

  if (!key) return { ...base, value: null, error: "FRED_API_KEY absente" };

  const url = new URL(FRED_BASE);
  url.searchParams.set("series_id", config.seriesId);
  url.searchParams.set("api_key", key);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("limit", String(config.limitObs));
  // Newest first, so `limit` keeps the most recent observations; the transforms
  // re-sort chronologically.
  url.searchParams.set("sort_order", "desc");

  try {
    const response = await fetch(url, {
      // Six hours: FRED revises intramonth, unlike the OECD's fixed releases.
      next: { revalidate: 6 * 60 * 60 },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return { ...base, value: null, error: `FRED ${response.status} ${response.statusText}` };
    }

    const payload = (await response.json()) as { observations?: FredObservation[] };
    const value = applyTransform(config.transform, payload.observations ?? []);

    if (!value) {
      return { ...base, value: null, error: "Observations FRED insuffisantes" };
    }

    return { ...base, value, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...base, value: null, error: message };
  }
}

/** Fetches every configured US series in parallel. */
export async function fetchFredUsdData(): Promise<FredSeriesResult[]> {
  return Promise.all(FRED_SERIES.map((config) => fetchSeries(config)));
}
