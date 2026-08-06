import "server-only";

import type { RawEventSummary, RawTwelveEvents } from "@/domain/dairy/gdt";

/**
 * Global Dairy Trade auction results.
 *
 * No key, no account, no rate limit published — the results are static JSON in
 * a public S3 bucket, which is how globaldairytrade.info's own front end reads
 * them. Found by watching the site's network traffic: the served HTML carries
 * the labels and none of the figures, so scraping the page returns an empty
 * percent sign.
 *
 * TWO REQUESTS, in sequence and not in parallel: the event id is only known
 * once `latest.json` has been read, and every other file lives under it.
 */

const BUCKET = "https://s3.amazonaws.com/www-production.globaldairytrade.info/results";

/** Auctions are fortnightly. Six hours is already far finer than the source. */
const TTL_SECONDS = 6 * 60 * 60;

class GdtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GdtError";
  }
}

async function gdtFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${BUCKET}${path}`, {
    next: { revalidate: TTL_SECONDS },
    // The refresh route has a 30-second budget and makes two of these. A
    // hanging request must fail the indicator, never the whole job.
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new GdtError(`GDT responded ${response.status} for ${path}`);

  return (await response.json()) as T;
}

export interface GdtPayloads {
  summary: RawEventSummary;
  /** Null when the twelve-event history could not be read; the summary alone still scores. */
  history: RawTwelveEvents | null;
  eventId: string;
}

/**
 * Pulls the latest auction, and its recent history when available.
 *
 * The history is best-effort: it feeds context and a chart, while the summary
 * is what `scoreDairy` actually reads. Losing the first must not cost the
 * second.
 */
export async function fetchLatestGdt(): Promise<GdtPayloads> {
  const pointer = await gdtFetch<{ latestEvent?: string }>("/latest.json");
  const eventId = pointer.latestEvent;

  if (!eventId || !/^[a-f0-9-]{36}$/i.test(eventId)) {
    // Validated before it reaches a URL: this value comes from outside and is
    // about to become a path.
    throw new GdtError("GDT returned no usable event id");
  }

  const summary = await gdtFetch<RawEventSummary>(`/${eventId}/event_summary.json`);

  const history = await gdtFetch<RawTwelveEvents>(
    `/${eventId}/price_indices_twelve_events.json`,
  ).catch(() => null);

  return { summary, history, eventId };
}
