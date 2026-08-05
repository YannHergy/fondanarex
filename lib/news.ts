import "server-only";

import { after } from "next/server";

import type { Lean } from "@/domain/news/tagging";
import {
  buildTranslatePrompt,
  parseTranslations,
  TRANSLATE_SCHEMA,
  TRANSLATE_SYSTEM,
} from "@/domain/news/translate";
import { fetchAllNews } from "@/lib/integrations/news";
import { callGeminiStructured, geminiConfigured } from "@/lib/integrations/llm";
import { prisma } from "@/lib/prisma";
import { NewsLean } from "@/lib/generated/prisma/enums";

/**
 * Stored headlines.
 *
 * Not per-currency tables: one article, several tags. A single headline is
 * routinely bullish one currency and bearish another — "British Pound rises as
 * soft ADP jobs report weighs on Dollar" — and duplicating the row per
 * currency would make that contradiction invisible.
 */

export interface NewsRow {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: Date;
  lean: Lean;
}

const LEAN_TO_DB: Record<Lean, NewsLean> = {
  bullish: NewsLean.BULLISH,
  bearish: NewsLean.BEARISH,
  neutral: NewsLean.NEUTRAL,
};

const LEAN_FROM_DB: Record<NewsLean, Lean> = {
  [NewsLean.BULLISH]: "bullish",
  [NewsLean.BEARISH]: "bearish",
  [NewsLean.NEUTRAL]: "neutral",
};

/** Headlines older than this are dropped on every refresh. */
const KEEP_DAYS = 14;

/**
 * How stale the store may be before a page view refreshes it.
 *
 * Thirty minutes, and the number is a judgement rather than a constraint: the
 * feed publishes about one article every twenty minutes, so half an hour
 * leaves the reader at most one or two behind. FXStreet caches its own feed for
 * sixty seconds, so anything above a minute is polite and anything below is
 * pointless.
 *
 * Note this is NOT the four hours the scheduled job uses. Those two numbers
 * answer different questions: four hours is the most one can wait without
 * LOSING an article, because the feed only holds nine and a half hours of them.
 * Thirty minutes is how fresh the page should feel. Conflating the ceiling with
 * the optimum is the mistake this comment exists to prevent repeating.
 */
const FRESH_MINUTES = 30;

/**
 * Past this, the refresh is awaited instead of backgrounded.
 *
 * A moderately stale store is worth showing immediately while the new articles
 * land for next time. A store from yesterday is not: the first visit of the
 * morning would show last night's news and silently replace it after the reader
 * had already looked away.
 */
const BLOCKING_HOURS = 6;

export interface RefreshSummary {
  fetched: number;
  stored: number;
  translated: number;
  alreadyKnown: number;
  removed: number;
  byCurrency: Record<string, number>;
}

/**
 * Pulls every source and stores what is new.
 *
 * Upserts rather than inserts: the same story reappears in a feed for hours,
 * and a unique index on the normalised URL is what keeps a currency page from
 * showing one headline five times.
 */
export async function refreshNews(options: { withGdelt?: boolean } = {}): Promise<RefreshSummary> {
  const articles = await fetchAllNews(options);

  let stored = 0;
  let alreadyKnown = 0;
  const byCurrency: Record<string, number> = {};

  for (const article of articles) {
    const existing = await prisma.newsArticle.findUnique({
      where: { urlHash: article.urlHash },
      select: { id: true },
    });

    if (existing) {
      alreadyKnown += 1;
      continue;
    }

    await prisma.newsArticle.create({
      data: {
        urlHash: article.urlHash,
        url: article.url,
        title: article.title,
        summary: article.summary,
        source: article.source,
        publishedAt: article.publishedAt,
        tags: {
          create: article.tags.map((tag) => ({
            currencyCode: tag.currency,
            lean: LEAN_TO_DB[tag.lean],
          })),
        },
      },
    });

    stored += 1;
    for (const tag of article.tags) {
      byCurrency[tag.currency] = (byCurrency[tag.currency] ?? 0) + 1;
    }
  }

  // Old headlines are deleted, not archived. A two-week-old currency story has
  // no analytical value and every row of it slows the page that reads them.
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000);
  const { count: removed } = await prisma.newsArticle.deleteMany({
    where: { publishedAt: { lt: cutoff } },
  });

  // Translated after the rows exist, and its failure is not the refresh's:
  // the articles are already readable in English by the time this runs.
  let translated = 0;
  try {
    translated = await translatePendingNews();
  } catch {
    translated = 0;
  }

  return { fetched: articles.length, stored, translated, alreadyKnown, removed, byCurrency };
}

/** Translated per call. Large enough to be one request, small enough to finish. */
const TRANSLATE_BATCH = 40;

/**
 * Fills the French columns for whatever is still missing them.
 *
 * Runs after storage, never during it: a headline must reach the database the
 * moment it is fetched, so a translation that fails or times out costs the
 * language and not the article. The page falls back to the original.
 */
export async function translatePendingNews(limit = TRANSLATE_BATCH): Promise<number> {
  if (!geminiConfigured()) return 0;

  const pending = await prisma.newsArticle.findMany({
    where: { titleFr: null },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: { id: true, title: true, summary: true },
  });

  if (pending.length === 0) return 0;

  const result = await callGeminiStructured({
    system: TRANSLATE_SYSTEM,
    prompt: buildTranslatePrompt(pending),
    schema: TRANSLATE_SCHEMA as unknown as object,
    validate: (value) => {
      const map = parseTranslations(value);
      return map.size > 0 ? map : null;
    },
    maxTokens: 16000,
  });

  if (!result.data) return 0;

  let written = 0;
  for (const article of pending) {
    const translation = result.data.get(article.id);
    if (!translation) continue;

    await prisma.newsArticle.update({
      where: { id: article.id },
      data: { titleFr: translation.titre, summaryFr: translation.resume },
    });
    written += 1;
  }

  return written;
}

/**
 * Refreshes the store if it has gone stale, and reports what it did.
 *
 * This is what makes the feed feel live without a scheduler: browsing IS the
 * schedule. Open a currency in the morning and it fetches; move between eight
 * currencies in the next ten minutes and it does nothing at all.
 *
 * The in-flight promise is shared rather than guarded by a flag, so eight
 * currency pages opened at once make ONE request instead of eight — the store
 * is global, and eight parallel refreshes would race on the same unique index
 * for identical rows.
 */
let inFlight: Promise<RefreshSummary> | null = null;

export async function ensureFreshNews(): Promise<"fresh" | "queued" | "refreshed"> {
  const newest = await prisma.newsArticle.findFirst({
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true },
  });

  const ageMinutes = newest
    ? (Date.now() - newest.fetchedAt.getTime()) / 60_000
    : Number.POSITIVE_INFINITY;

  if (ageMinutes < FRESH_MINUTES) return "fresh";

  const run = () => {
    inFlight ??= refreshNews().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  if (ageMinutes > BLOCKING_HOURS * 60) {
    await run();
    return "refreshed";
  }

  // Started but not awaited: the reader gets the page now, and the new
  // headlines are waiting on the next load. `after` keeps the work alive past
  // the response, which a bare floating promise would not guarantee.
  after(() => run());
  return "queued";
}

/**
 * Headlines for one currency, newest first.
 *
 * Returns an empty array when there are none, and the caller must render that
 * as "nothing today" rather than widening the query. A trader shown three
 * irrelevant articles under a currency stops trusting the fourth.
 */
export async function listNewsFor(currencyCode: string, limit = 8): Promise<NewsRow[]> {
  const tags = await prisma.newsTag.findMany({
    where: { currencyCode },
    orderBy: { article: { publishedAt: "desc" } },
    take: limit,
    select: {
      lean: true,
      article: {
        select: {
          id: true,
          title: true,
          summary: true,
          titleFr: true,
          summaryFr: true,
          url: true,
          source: true,
          publishedAt: true,
        },
      },
    },
  });

  return tags.map((tag) => ({
    id: tag.article.id,
    // French when it exists, original otherwise. A missing translation costs
    // the language, never the headline.
    title: tag.article.titleFr ?? tag.article.title,
    summary: tag.article.summaryFr ?? tag.article.summary,
    url: tag.article.url,
    source: tag.article.source,
    publishedAt: tag.article.publishedAt,
    lean: LEAN_FROM_DB[tag.lean],
  }));
}

export interface GlobalNewsRow {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: Date;
  /** Empty when the headline names no currency — shown as market-wide. */
  tags: { currency: string; lean: Lean }[];
}

/**
 * Every headline, newest first, whatever it is about.
 *
 * The currency pages filter; this one does not. A story about oil or the S&P
 * carries no tag and is shown as market-wide rather than hidden — a trader
 * reading a forex feed wants the whole feed, and the tags are there to sort it,
 * not to censor it.
 */
export async function listAllNews(limit = 60): Promise<GlobalNewsRow[]> {
  const articles = await prisma.newsArticle.findMany({
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      summary: true,
      titleFr: true,
      summaryFr: true,
      url: true,
      source: true,
      publishedAt: true,
      tags: { select: { currencyCode: true, lean: true } },
    },
  });

  return articles.map((article) => ({
    id: article.id,
    title: article.titleFr ?? article.title,
    summary: article.summaryFr ?? article.summary,
    url: article.url,
    source: article.source,
    publishedAt: article.publishedAt,
    tags: article.tags.map((tag) => ({
      currency: tag.currencyCode,
      lean: LEAN_FROM_DB[tag.lean],
    })),
  }));
}

/** Counts per currency and direction, for the dashboard. */
export async function newsBalance(
  since = new Date(Date.now() - 3 * 86_400_000),
): Promise<Record<string, { bullish: number; bearish: number; neutral: number }>> {
  const rows = await prisma.newsTag.groupBy({
    by: ["currencyCode", "lean"],
    where: { article: { publishedAt: { gte: since } } },
    _count: true,
  });

  const out: Record<string, { bullish: number; bearish: number; neutral: number }> = {};

  for (const row of rows) {
    const bucket = out[row.currencyCode] ?? { bullish: 0, bearish: 0, neutral: 0 };
    bucket[LEAN_FROM_DB[row.lean]] = row._count;
    out[row.currencyCode] = bucket;
  }

  return out;
}
