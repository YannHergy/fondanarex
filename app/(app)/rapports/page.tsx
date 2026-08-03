import type { Metadata } from "next";

import { NewsAlignmentPanel } from "@/app/(app)/rapports/_components/news-alignment-panel";
import { ReportsView } from "@/app/(app)/rapports/_components/reports-view";
import { alignTrades, type DayEvent } from "@/domain/journal/news-alignment";
import { prisma } from "@/lib/prisma";
import { listTrades } from "@/lib/journal";
import { requireUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Rapports" };
export const dynamic = "force-dynamic";

export default async function RapportsPage() {
  const userId = await requireUserId();

  // Reads the journal directly rather than keeping its own store: a report that
  // can disagree with the journal it describes is worse than no report.
  const [trades, events] = await Promise.all([
    listTrades(userId, 2000),
    // Graded calendar events are what makes the correlation possible; an
    // ungraded one carries no direction to correlate against.
    prisma.weeklyEvent.findMany({
      where: { userId, impact: { not: null } },
      select: { scheduledAt: true, currencyCode: true, impact: true },
      take: 2000,
    }),
  ]);

  const dayEvents: DayEvent[] = events.map((event) => ({
    date: event.scheduledAt.toISOString().slice(0, 10),
    currencyCode: event.currencyCode,
    impact: event.impact as DayEvent["impact"],
  }));

  const aligned = alignTrades(
    trades.map((trade) => ({
      id: trade.id,
      instrument: trade.instrument,
      direction: trade.direction,
      date: trade.openedAt.toISOString().slice(0, 10),
      pnl: trade.pnl,
    })),
    dayEvents,
  );

  return (
    <>
      <ReportsView trades={trades} now={new Date().toISOString()} />
      <div className="mx-auto w-full max-w-6xl px-5 pb-5 md:px-6 md:pb-6">
        <NewsAlignmentPanel aligned={aligned} />
      </div>
    </>
  );
}
