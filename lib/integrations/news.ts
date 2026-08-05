import "server-only";

import { createHash } from "node:crypto";

import { firstSentence, parseFeed, type FeedItem } from "@/domain/news/rss";
import { CURRENCY_TERMS, tagArticle, type Tag } from "@/domain/news/tagging";

/**
 * Forex news, from sources that cost nothing and expire never.
 *
 * FXStreet is the primary and it needs no key. That is not merely convenient:
 * the legacy app's Marketaux and Finnhub keys can be revoked, throttled or
 * left unpaid, and a currency page that goes blank because a key lapsed is
 * worse than one that never promised news.
 *
 * Measured on a live feed while building this: FXStreet returned 30 articles,
 * all same-day, covering all eight currencies. Finnhub's general feed returned
 * 100 articles of which the legacy keyword filter kept four currencies' worth,
 * one of them a Boeing story filed under sterling.
 */

export interface FetchedArticle {
  urlHash: string;
  url: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: Date;
  tags: Tag[];
}

/** Deduplication key. The same story reaches us from several feeds. */
function hashUrl(url: string): string {
  // Normalised first: feeds append tracking parameters that differ per fetch,
  // so the raw URL would defeat the unique index it exists to serve.
  const normalised = url.split("?")[0]?.replace(/\/+$/, "").toLowerCase() ?? url;
  return createHash("sha256").update(normalised).digest("hex").slice(0, 40);
}

const FETCH_TIMEOUT_MS = 12_000;
const UA = "Mozilla/5.0 (compatible; Fondanarex/1.0)";

async function get(url: string, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, ...headers },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

function toArticle(item: FeedItem, source: string): FetchedArticle | null {
  const tags = tagArticle(item.title, item.summary);
  // Untagged headlines are dropped rather than stored: they are gold, indices
  // and equities, and no currency page would ever show them.
  if (tags.length === 0) return null;

  return {
    urlHash: hashUrl(item.url),
    url: item.url,
    title: item.title,
    summary: item.summary,
    source,
    publishedAt: item.publishedAt ?? new Date(),
    tags,
  };
}

// ── FXStreet ──────────────────────────────────────────────────────────────

const FXSTREET_FEEDS = [
  { url: "https://www.fxstreet.com/rss/news", source: "FXStreet" },
  { url: "https://www.fxstreet.com/rss/analysis", source: "FXStreet Analyse" },
];

export async function fetchFxStreet(): Promise<FetchedArticle[]> {
  const out: FetchedArticle[] = [];

  for (const feed of FXSTREET_FEEDS) {
    const xml = await get(feed.url);
    if (!xml) continue;

    for (const item of parseFeed(xml)) {
      const article = toArticle(item, feed.source);
      if (article) out.push(article);
    }
  }

  return out;
}

// ── Marketaux ─────────────────────────────────────────────────────────────

interface MarketauxArticle {
  title?: string;
  description?: string;
  url?: string;
  published_at?: string;
  source?: string;
}

/**
 * Marketaux, kept as a complement rather than a source of record.
 *
 * Its free plan returns three articles per request and tags them broadly — a
 * story about the Strait of Hormuz came back labelled EURUSD. Its headlines go
 * through the same tagger as everything else instead of being trusted, so a
 * loose vendor tag cannot put an irrelevant article on a currency page.
 */
export async function fetchMarketaux(): Promise<FetchedArticle[]> {
  const key = process.env.MARKETAUX_API_KEY ?? "";
  if (!key) return [];

  const raw = await get(
    `https://api.marketaux.com/v1/news/all?filter_entities=true&language=en&sort=published_desc&limit=3&api_token=${key}`,
  );
  if (!raw) return [];

  try {
    const payload = JSON.parse(raw) as { data?: MarketauxArticle[] };

    return (payload.data ?? [])
      .map((entry) =>
        entry.title && entry.url
          ? toArticle(
              {
                title: entry.title,
                summary: firstSentence(entry.description ?? ""),
                url: entry.url,
                publishedAt: entry.published_at ? new Date(entry.published_at) : null,
              },
              entry.source ?? "Marketaux",
            )
          : null,
      )
      .filter((article): article is FetchedArticle => article !== null);
  } catch {
    return [];
  }
}

// ── GDELT ─────────────────────────────────────────────────────────────────

interface GdeltArticle {
  title?: string;
  url?: string;
  domain?: string;
  seendate?: string;
}

/** "20260805T154500Z" — GDELT's own stamp format, which Date cannot read. */
function parseGdeltDate(raw: string | undefined): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(raw ?? "");
  if (!match) return null;

  const [, y, mo, d, h, mi, s] = match;
  return new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!));
}

/**
 * GDELT, used only to fill gaps.
 *
 * No key, no quota — but ONE REQUEST EVERY FIVE SECONDS, enforced, and it
 * answers with a plain-text scolding rather than an error code. Hence the
 * deliberate spacing below and the per-currency loop: this is called from a
 * scheduled refresh where twenty seconds cost nothing, never from a page.
 */
export async function fetchGdelt(currencies: readonly string[]): Promise<FetchedArticle[]> {
  const out: FetchedArticle[] = [];

  for (const [index, code] of currencies.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 5_500));

    const terms = (CURRENCY_TERMS[code] ?? [])
      .filter((term): term is string => typeof term === "string" && term.includes(" "))
      .slice(0, 3)
      .map((term) => `"${term}"`);
    if (terms.length === 0) continue;

    // Parentheses around OR'd terms are mandatory; GDELT rejects the query
    // outright without them, in prose rather than JSON.
    const query = encodeURIComponent(`(${terms.join(" OR ")})`);
    const raw = await get(
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=8&timespan=3d&format=json&sort=datedesc`,
    );
    if (!raw || !raw.trimStart().startsWith("{")) continue;

    try {
      const payload = JSON.parse(raw) as { articles?: GdeltArticle[] };

      for (const entry of payload.articles ?? []) {
        if (!entry.title || !entry.url) continue;

        const article = toArticle(
          {
            title: entry.title,
            summary: "",
            url: entry.url,
            publishedAt: parseGdeltDate(entry.seendate),
          },
          entry.domain ?? "GDELT",
        );
        if (article) out.push(article);
      }
    } catch {
      continue;
    }
  }

  return out;
}

/**
 * Every source, deduplicated.
 *
 * FXStreet runs first so its version of a shared story wins: it writes the
 * currency into the headline, which is what makes the tagging reliable.
 */
export async function fetchAllNews(options: { withGdelt?: boolean } = {}): Promise<FetchedArticle[]> {
  const [fxstreet, marketaux] = await Promise.all([fetchFxStreet(), fetchMarketaux()]);

  const gdelt = options.withGdelt
    ? await fetchGdelt(["CHF", "NZD", "AUD", "CAD"])
    : [];

  const seen = new Set<string>();
  const out: FetchedArticle[] = [];

  for (const article of [...fxstreet, ...marketaux, ...gdelt]) {
    if (seen.has(article.urlHash)) continue;
    seen.add(article.urlHash);
    out.push(article);
  }

  return out;
}
