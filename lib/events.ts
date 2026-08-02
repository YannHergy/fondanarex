import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Currencies with a high-impact release scheduled inside the window.
 *
 * Lives here rather than inline in a page because it reads the clock: a React
 * component is meant to be a pure function of its props, and calling
 * `Date.now()` during render breaks that contract (the lint rule that enforces
 * it is correct to complain). Data access is the right home for "now".
 *
 * Only unpublished events count — one with an `actual` value has already been
 * released and can no longer surprise the market.
 */
export async function getCurrenciesWithUpcomingNews(
  userId: string,
  withinHours = 24,
): Promise<Set<string>> {
  const now = new Date();
  const until = new Date(now.getTime() + withinHours * 3600_000);

  const events = await prisma.weeklyEvent.findMany({
    where: {
      userId,
      importance: "HIGH",
      actual: null,
      scheduledAt: { gte: now, lte: until },
    },
    select: { currencyCode: true },
  });

  return new Set(events.map((e) => e.currencyCode));
}
