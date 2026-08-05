import "server-only";

import type { Lean } from "@/domain/news/tagging";
import { fetchAllNews } from "@/lib/integrations/news";
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

export interface RefreshSummary {
  fetched: number;
  stored: number;
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

  return { fetched: articles.length, stored, alreadyKnown, removed, byCurrency };
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
          url: true,
          source: true,
          publishedAt: true,
        },
      },
    },
  });

  return tags.map((tag) => ({
    id: tag.article.id,
    title: tag.article.title,
    summary: tag.article.summary,
    url: tag.article.url,
    source: tag.article.source,
    publishedAt: tag.article.publishedAt,
    lean: LEAN_FROM_DB[tag.lean],
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
