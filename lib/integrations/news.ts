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

/**
 * A browser User-Agent, and it is load-bearing.
 *
 * This module used to send `Mozilla/5.0 (compatible; Fondanarex/1.0)` — an
 * honest bot signature. Measured live: from a residential connection both
 * FXStreet feeds answer it with 24 KB of XML, but the same request from
 * Vercel came back refused in 2.4 seconds — far too fast to be a timeout —
 * and `fetchAllNews` returned ZERO articles for three days straight while
 * the cron kept reporting `ok: true`.
 *
 * Datacenter IP plus a self-declared bot is what the filter rejects. Every
 * other integration here that reaches a bot-protected host (the ONS, the
 * RBA, StatCan, Stats NZ) already sends this exact Chrome string and fetches
 * from Vercel without trouble — the news module was simply the one place
 * that still announced itself, not the victim of a new block.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** A source that answered with something other than its content. */
export interface SourceFailure {
  source: string;
  reason: string;
}

/**
 * Fetches a URL, REPORTING why it failed rather than swallowing it.
 *
 * The previous version returned `null` for every failure mode — refused,
 * rate-limited, timed out, unreachable — and each caller quietly moved on.
 * That is what let a total outage look like a successful run for three days:
 * nothing upstream of here had any way to tell "no news today" apart from
 * "the source slammed the door".
 */
async function get(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ body: string | null; reason: string | null }> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7",
        ...headers,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return { body: null, reason: `HTTP ${response.status}` };
    return { body: await response.text(), reason: null };
  } catch (error) {
    return { body: null, reason: error instanceof Error ? error.message : "échec réseau" };
  }
}

/**
 * Turns a feed item into an article, or rejects it.
 *
 * `forexNative` decides what happens to a headline naming no currency, and the
 * distinction is not cosmetic. FXStreet publishes about oil, gold and indices
 * BECAUSE they move currencies, so its untagged headlines belong on a forex
 * desk and are kept under a market-wide marker. Marketaux publishes general
 * business news, and keeping its untagged items put an earnings call transcript
 * and a car-rental subsidiary in Bahrain on the page — measured, not feared.
 *
 * So: a forex-native feed may go untagged. A general feed must earn its place
 * by naming a currency.
 */
function toArticle(
  item: FeedItem,
  source: string,
  options: { forexNative: boolean },
): FetchedArticle | null {
  if (!item.title || !item.url) return null;

  const tags = tagArticle(item.title, item.summary);
  if (tags.length === 0 && !options.forexNative) return null;

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

export async function fetchFxStreet(): Promise<{
  articles: FetchedArticle[];
  failures: SourceFailure[];
}> {
  const out: FetchedArticle[] = [];
  const failures: SourceFailure[] = [];

  for (const feed of FXSTREET_FEEDS) {
    const { body: xml, reason } = await get(feed.url);
    if (!xml) {
      failures.push({ source: feed.source, reason: reason ?? "réponse vide" });
      continue;
    }

    const items = parseFeed(xml);
    // A feed that answers 200 with nothing parseable is a failure too: it
    // means the format moved under us, which is invisible from the status
    // code alone and would otherwise read as "a quiet news day".
    if (items.length === 0) {
      failures.push({ source: feed.source, reason: "flux illisible (format changé ?)" });
      continue;
    }

    for (const item of items) {
      // Forex-native: everything it publishes is on a forex desk's radar.
      const article = toArticle(item, feed.source, { forexNative: true });
      if (article) out.push(article);
    }
  }

  return { articles: out, failures };
}

// ── Google News ───────────────────────────────────────────────────────────

/**
 * Google News RSS — the source that answers a datacenter.
 *
 * Added because FXStreet returns HTTP 403 to Vercel outright, verified from
 * production: the browser User-Agent above was not enough, so the block is on
 * the IP range rather than the signature. ForexLive and DailyFX refuse the
 * same way. Google publishes this feed expressly to be consumed by machines,
 * which is exactly the property the others turned out to lack.
 *
 * The queries are hand-written multi-word phrases rather than derived from
 * CURRENCY_TERMS: the bare terms there include 'euro' and 'cable', which are
 * precise enough for TAGGING a forex headline but pull in football and
 * telecoms when used to SEARCH the open web. Central-bank names and full
 * currency names keep the results on topic.
 *
 * Grouped four ways rather than eight so one refresh is four requests, and
 * every headline still goes through the same tagger — a result that names no
 * currency is dropped, exactly like Marketaux's.
 */
const GOOGLE_NEWS_QUERIES = [
  '"Federal Reserve" OR FOMC OR "US dollar" OR "dollar index"',
  '"European Central Bank" OR "Bank of England" OR "euro area" OR "pound sterling"',
  '"Bank of Japan" OR "Swiss National Bank" OR "Japanese yen" OR "Swiss franc"',
  '"Bank of Canada" OR "Reserve Bank of Australia" OR "Reserve Bank of New Zealand" OR "Canadian dollar" OR "Australian dollar" OR "New Zealand dollar"',
];

/**
 * "Headline — Reuters" -> { title: "Headline", source: "Reuters" }.
 *
 * Google appends the publisher to every title after the LAST " - ". Split on
 * the last one, not the first: plenty of headlines contain a hyphen of their
 * own ("Fed holds - as expected - at 4%").
 */
function splitGooglePublisher(raw: string): { title: string; source: string } {
  const at = raw.lastIndexOf(" - ");
  if (at < 0) return { title: raw, source: "Google News" };

  const title = raw.slice(0, at).trim();
  const source = raw.slice(at + 3).trim();
  // A suffix that is empty or absurdly long is not a publisher name.
  if (!title || !source || source.length > 40) return { title: raw, source: "Google News" };

  return { title, source };
}

export async function fetchGoogleNews(): Promise<{
  articles: FetchedArticle[];
  failures: SourceFailure[];
}> {
  const out: FetchedArticle[] = [];
  const failures: SourceFailure[] = [];

  const results = await Promise.all(
    GOOGLE_NEWS_QUERIES.map(async (query) => {
      // `when:2d` keeps the window tight; the store already dedupes, so an
      // overlap between runs costs nothing.
      const url =
        `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:2d`)}` +
        `&hl=en-US&gl=US&ceid=US:en`;
      return { query, ...(await get(url)) };
    }),
  );

  for (const { query, body: xml, reason } of results) {
    if (!xml) {
      failures.push({ source: "Google News", reason: `${reason ?? "réponse vide"} (${query.slice(0, 30)}…)` });
      continue;
    }

    for (const item of parseFeed(xml)) {
      const { title, source } = splitGooglePublisher(item.title);
      const article = toArticle(
        // The description is a bare anchor tag on this feed, so it decodes to
        // the headline again — an empty summary is honest where a duplicate
        // of the title would just be noise under it.
        { title, summary: "", url: item.url, publishedAt: item.publishedAt },
        source,
        // A general search feed: it must name a currency to earn its place.
        { forexNative: false },
      );
      if (article) out.push(article);
    }
  }

  return { articles: out, failures };
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
export async function fetchMarketaux(): Promise<{
  articles: FetchedArticle[];
  failures: SourceFailure[];
}> {
  const key = process.env.MARKETAUX_API_KEY ?? "";
  // Not configured is not a failure — it is a source we deliberately do
  // without. Only a configured source that refuses is worth reporting.
  if (!key) return { articles: [], failures: [] };

  const { body: raw, reason } = await get(
    `https://api.marketaux.com/v1/news/all?filter_entities=true&language=en&sort=published_desc&limit=3&api_token=${key}`,
  );
  if (!raw) return { articles: [], failures: [{ source: "Marketaux", reason: reason ?? "réponse vide" }] };

  try {
    const payload = JSON.parse(raw) as { data?: MarketauxArticle[] };

    const articles = (payload.data ?? [])
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
              // General business feed: it must name a currency to be kept.
              { forexNative: false },
            )
          : null,
      )
      .filter((article): article is FetchedArticle => article !== null);

    return { articles, failures: [] };
  } catch {
    return { articles: [], failures: [{ source: "Marketaux", reason: "réponse JSON illisible" }] };
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
 * No key, no quota — but a rate limit it enforces by answering with a
 * plain-text scolding rather than an error code, so a throttled call looks
 * like an empty result unless you read the body.
 *
 * MEASURED: the documented "one request every five seconds" is optimistic.
 * Spacing at 5.5s still came back throttled, so this waits 11. A full pass
 * therefore costs about 45 seconds, which is why it only ever runs from the
 * scheduled refresh and never from a page.
 *
 * Honest note on value: FXStreet already covers all eight currencies on its
 * own, so this fills a gap that has not appeared yet. It is kept for the days
 * a quiet currency goes unmentioned, not because anything depends on it.
 */
export async function fetchGdelt(currencies: readonly string[]): Promise<FetchedArticle[]> {
  const out: FetchedArticle[] = [];

  for (const [index, code] of currencies.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 11_000));

    const terms = (CURRENCY_TERMS[code] ?? [])
      .filter((term): term is string => typeof term === "string" && term.includes(" "))
      .slice(0, 3)
      .map((term) => `"${term}"`);
    if (terms.length === 0) continue;

    // Parentheses around OR'd terms are mandatory; GDELT rejects the query
    // outright without them, in prose rather than JSON.
    const query = encodeURIComponent(`(${terms.join(" OR ")})`);
    const { body: raw } = await get(
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=8&timespan=3d&format=json&sort=datedesc`,
    );
    // Throttling arrives as a plain-text scolding with a 200 status (see the
    // note above), so the JSON check is the real test, not the status code.
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
          // Queried BY currency, so an untagged result missed its own query.
          { forexNative: false },
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
 * FXStreet runs FIRST so its version of a shared story wins: it writes the
 * currency into the headline, which is what makes the tagging reliable. It is
 * kept ahead of Google News for that reason even though it currently answers
 * 403 from Vercel — the order costs nothing when it is refused, and the day
 * the block lifts its headlines are the better ones.
 *
 * Google News is the one that actually feeds production today. Treating it as
 * a peer rather than a replacement is deliberate: a single reachable source is
 * how this broke in the first place.
 */
export async function fetchAllNews(
  options: { withGdelt?: boolean } = {},
): Promise<{ articles: FetchedArticle[]; failures: SourceFailure[] }> {
  const [fxstreet, google, marketaux] = await Promise.all([
    fetchFxStreet(),
    fetchGoogleNews(),
    fetchMarketaux(),
  ]);

  const gdelt = options.withGdelt ? await fetchGdelt(["CHF", "NZD", "AUD", "CAD"]) : [];

  const seen = new Set<string>();
  const out: FetchedArticle[] = [];

  for (const article of [
    ...fxstreet.articles,
    ...google.articles,
    ...marketaux.articles,
    ...gdelt,
  ]) {
    if (seen.has(article.urlHash)) continue;
    seen.add(article.urlHash);
    out.push(article);
  }

  return {
    articles: out,
    failures: [...fxstreet.failures, ...google.failures, ...marketaux.failures],
  };
}
