import Link from "next/link";

import {
  ScoreHistoryChart,
  type ScorePoint,
} from "@/app/(app)/devise/[code]/_components/score-history-chart";
import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { prisma } from "@/lib/prisma";

/**
 * The currency's score over time.
 *
 * Reads ScoreSnapshot, which a refresh writes one row per currency into, plus
 * — for the EUR, AUD, CAD and NZD — a monthly series rebuilt back to January
 * 2023 by replaying the scoring engine against the indicator table as it
 * stood each month. The other four currencies still only have what daily
 * refreshes have accumulated since — the same backfill applies to them
 * cleanly whenever they get a source with comparable historical depth.
 *
 * Deliberately rendered even with a single point rather than hidden: showing
 * where the score sits now, with the axis already in place, makes it obvious
 * that history is accumulating rather than missing.
 *
 * The drawing itself lives in ScoreHistoryChart, a client component, so the
 * curve can be hovered for an exact reading.
 */

export async function ScoreHistory({ code, current }: { code: string; current: number }) {
  const snapshots = await prisma.scoreSnapshot.findMany({
    where: { currencyCode: code },
    orderBy: { computedAt: "asc" },
    select: { total: true, computedAt: true },
    take: 400,
  });

  const points: ScorePoint[] = snapshots.map((s) => ({
    value: Number(s.total),
    at: s.computedAt.toISOString(),
  }));

  // No snapshot yet: plot today's score so the chart is honest rather than
  // empty — the reading is real, only the history is missing.
  if (points.length === 0) points.push({ value: current, at: new Date().toISOString() });

  const first = points[0]!;
  const last = points.at(-1)!;
  // The year is included as soon as the span crosses one. The history used to
  // be a few days long, where "30 janv. → 11 août" was unambiguous; it now
  // reaches back to 2023, and the same label would read as a single year.
  const firstAt = new Date(first.at);
  const lastAt = new Date(last.at);
  const spansYears = firstAt.getFullYear() !== lastAt.getFullYear();
  const dateFmt = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    ...(spansYears ? { year: "numeric" } : {}),
  });

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/devise/${code.toLowerCase()}/score`}
          className="hover:text-brand-blue inline-flex items-center gap-1.5 transition-colors"
        >
          <CardTitle icon="show_chart" className="mb-0">
            Score dans le temps
          </CardTitle>
          <Icon name="open_in_full" size={13} className="text-brand-blue shrink-0" />
        </Link>
        <span className="text-subtle text-[11px]">
          {points.length > 1
            ? `${points.length} relevés · ${dateFmt.format(firstAt)} → ${dateFmt.format(lastAt)}`
            : "Historique en cours de constitution · un relevé à chaque rafraîchissement"}
        </span>
      </div>

      <ScoreHistoryChart points={points} code={code} />
    </Card>
  );
}
