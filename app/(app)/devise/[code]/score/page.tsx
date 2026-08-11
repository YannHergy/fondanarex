import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ScoreHistoryChart,
  type ScorePoint,
} from "@/app/(app)/devise/[code]/_components/score-history-chart";
import { Card, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { getScoredCurrencies } from "@/lib/currencies";
import { prisma } from "@/lib/prisma";
import { scoreTextClass, scoreVerdict } from "@/lib/score-display";
import { requireUserId } from "@/lib/session";
import { isCurrencyCode } from "@/lib/utils";

/**
 * The macro score in full: the same curve the currency page shows in a corner,
 * given the room to be read, plus the readings as text.
 *
 * The table is not decoration — it is the chart's accessible twin. A curve
 * whose meaning is carried by colour bands needs a form that survives without
 * them.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  return { title: `Score macroéconomique — ${code.toUpperCase()}` };
}

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

export default async function ScorePage({ params }: { params: Promise<{ code: string }> }) {
  const userId = await requireUserId();
  const { code } = await params;
  const upperCode = code.toUpperCase();
  if (!isCurrencyCode(upperCode)) notFound();

  const currencies = await getScoredCurrencies(userId);
  const currency = currencies[upperCode];
  if (!currency) notFound();

  const snapshots = await prisma.scoreSnapshot.findMany({
    where: { currencyCode: upperCode },
    orderBy: { computedAt: "asc" },
    select: { total: true, computedAt: true, weightUsed: true },
    take: 400,
  });

  const points: ScorePoint[] = snapshots.map((s) => ({
    value: Number(s.total),
    at: s.computedAt.toISOString(),
  }));
  if (points.length === 0) {
    points.push({ value: currency.scores.total, at: new Date().toISOString() });
  }

  const current = currency.scores.total;
  const values = points.map((p) => p.value);
  const lowest = Math.min(...values);
  const highest = Math.max(...values);

  // Newest first in the table: the most recent reading is the one being looked
  // for, and scrolling to the bottom of 57 rows to find it is a chore.
  const rows = [...snapshots].reverse();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-5 md:p-6">
      <Link
        href={`/devise/${code.toLowerCase()}`}
        className="text-muted hover:text-fg inline-flex items-center gap-1.5 text-xs transition-colors"
      >
        <Icon name="arrow_back" size={14} /> Retour à {upperCode}
      </Link>

      <PageHeader
        title={`Score macroéconomique — ${currency.code}`}
        subtitle={currency.name}
      />

      <Card>
        <div className="border-border-app mb-4 flex flex-wrap items-end justify-between gap-4 border-b pb-4">
          <div>
            <p className="text-subtle text-[10px] font-bold tracking-wide uppercase">
              Score actuel
            </p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className={`font-mono text-5xl font-bold ${scoreTextClass(current)}`}>
                {current.toFixed(0)}
              </span>
              <span className="text-muted text-sm">/ 100</span>
              <span className={`text-sm font-semibold ${scoreTextClass(current)}`}>
                {scoreVerdict(current)}
              </span>
            </p>
          </div>

          <dl className="flex gap-6 text-xs">
            <div>
              <dt className="text-subtle text-[10px] font-bold tracking-wide uppercase">
                Plus bas
              </dt>
              <dd className="tabular text-fg mt-1 font-mono text-lg">{lowest.toFixed(0)}</dd>
            </div>
            <div>
              <dt className="text-subtle text-[10px] font-bold tracking-wide uppercase">
                Plus haut
              </dt>
              <dd className="tabular text-fg mt-1 font-mono text-lg">{highest.toFixed(0)}</dd>
            </div>
            <div>
              <dt className="text-subtle text-[10px] font-bold tracking-wide uppercase">
                Relevés
              </dt>
              <dd className="tabular text-fg mt-1 font-mono text-lg">{points.length}</dd>
            </div>
          </dl>
        </div>

        <ScoreHistoryChart points={points} code={upperCode} height={300} />
      </Card>

      <Card>
        <p className="text-subtle mb-3 text-[10px] font-bold tracking-wide uppercase">
          Relevés ({rows.length})
        </p>
        {rows.length === 0 ? (
          <p className="text-subtle text-sm">Aucun relevé enregistré pour le moment.</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-panel sticky top-0">
                <tr className="text-subtle text-left">
                  <th className="py-2 font-semibold">Date</th>
                  <th className="py-2 text-right font-semibold">Score</th>
                  <th className="py-2 text-right font-semibold">Verdict</th>
                  <th className="py-2 text-right font-semibold">Poids utilisé</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const value = Number(row.total);
                  return (
                    <tr
                      key={row.computedAt.toISOString()}
                      className="border-border-app border-b last:border-0"
                    >
                      <td className="text-muted py-2">{DATE_FMT.format(row.computedAt)}</td>
                      <td className={`tabular py-2 text-right font-mono ${scoreTextClass(value)}`}>
                        {value.toFixed(0)}
                      </td>
                      <td className="text-muted py-2 text-right">{scoreVerdict(value)}</td>
                      <td className="tabular text-subtle py-2 text-right font-mono">
                        {row.weightUsed === null ? "—" : `${Number(row.weightUsed).toFixed(0)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
