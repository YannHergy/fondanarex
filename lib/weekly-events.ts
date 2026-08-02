import "server-only";

import { getWeekRange } from "@/domain/events/week";
import type { SummarisableEvent } from "@/domain/events/summary";
import { prisma } from "@/lib/prisma";

/**
 * Weekly economic events.
 *
 * The legacy service kept these in one localStorage array and filtered it in
 * memory on every read. Here they are rows, queried by the denormalised
 * `weekKey` so a week loads with an index hit rather than a full scan.
 */

export interface WeeklyEventRow {
  id: string;
  currencyCode: string;
  name: string;
  weekKey: string;
  scheduledAt: Date;
  importance: "HIGH" | "MEDIUM" | "LOW";
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  impact: SummarisableEvent["impact"];
  pipsVariation: number | null;
  notes: string | null;
  fromCalendar: boolean;
}

function toRow(event: {
  id: string;
  currencyCode: string;
  name: string;
  weekKey: string;
  scheduledAt: Date;
  importance: string;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  impact: string | null;
  pipsVariation: unknown;
  notes: string | null;
  fromCalendar: boolean;
}): WeeklyEventRow {
  return {
    id: event.id,
    currencyCode: event.currencyCode,
    name: event.name,
    weekKey: event.weekKey,
    scheduledAt: event.scheduledAt,
    importance: event.importance as WeeklyEventRow["importance"],
    forecast: event.forecast,
    previous: event.previous,
    actual: event.actual,
    impact: (event.impact ?? null) as SummarisableEvent["impact"],
    pipsVariation: event.pipsVariation === null ? null : Number(event.pipsVariation),
    notes: event.notes,
    fromCalendar: event.fromCalendar,
  };
}

/** Every event of a week, optionally for one currency. */
export async function getEventsForWeek(
  userId: string,
  weekKey: string,
  currencyCode?: string,
): Promise<WeeklyEventRow[]> {
  const events = await prisma.weeklyEvent.findMany({
    where: { userId, weekKey, ...(currencyCode ? { currencyCode } : {}) },
    orderBy: [{ scheduledAt: "asc" }, { currencyCode: "asc" }],
  });
  return events.map(toRow);
}

/**
 * Events across several weeks, in one query.
 *
 * Used by the 12-week history. Querying week by week would be twelve round
 * trips to render one sparkline.
 */
export async function getEventsForWeeks(
  userId: string,
  weekKeys: readonly string[],
  currencyCode?: string,
): Promise<Map<string, WeeklyEventRow[]>> {
  if (weekKeys.length === 0) return new Map();

  const events = await prisma.weeklyEvent.findMany({
    where: {
      userId,
      weekKey: { in: [...weekKeys] },
      ...(currencyCode ? { currencyCode } : {}),
    },
    orderBy: { scheduledAt: "asc" },
  });

  const byWeek = new Map<string, WeeklyEventRow[]>();
  for (const key of weekKeys) byWeek.set(key, []);
  for (const event of events) {
    byWeek.get(event.weekKey)?.push(toRow(event));
  }
  return byWeek;
}

/** Converts a stored event into the shape the summary functions expect. */
export function toSummarisable(event: WeeklyEventRow): SummarisableEvent {
  return {
    impact: event.impact,
    pipsVariation: event.pipsVariation,
    date: event.scheduledAt.toISOString().slice(0, 10),
  };
}

/** Range bounds for a week, for queries that need timestamps rather than a key. */
export function weekBounds(weekKey: string): { start: Date; end: Date } {
  return getWeekRange(weekKey);
}

/**
 * The next scheduled events that have not yet been published.
 *
 * Powers the overview's "upcoming releases" panel, which previously came from a
 * third-party calendar. Reading the user's own rows means the overview and the
 * Calendrier screen can never disagree, and it works without any subscription.
 */
export async function getUpcomingEvents(
  userId: string,
  limit = 8,
): Promise<WeeklyEventRow[]> {
  const events = await prisma.weeklyEvent.findMany({
    where: { userId, actual: null, scheduledAt: { gte: new Date() } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });
  return events.map(toRow);
}
