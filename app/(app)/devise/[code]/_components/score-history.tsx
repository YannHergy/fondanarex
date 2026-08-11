import { Card, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { CURRENCY_COLOR_VAR, isCurrencyCode } from "@/lib/utils";

/**
 * The currency's score over time.
 *
 * Reads ScoreSnapshot, which a refresh writes one row per currency into. That
 * table was empty until now — the manual refresh action recorded snapshots but
 * the scheduled route never did, and every refresh so far went through the
 * route — so the curve starts today and fills in from here.
 *
 * Deliberately rendered even with a single point rather than hidden: showing
 * where the score sits now, with the axis already in place, makes it obvious
 * that history is accumulating rather than missing.
 */

const WIDTH = 720;
const HEIGHT = 180;
const PAD_X = 34;
const PAD_Y = 16;

export async function ScoreHistory({ code, current }: { code: string; current: number }) {
  const snapshots = await prisma.scoreSnapshot.findMany({
    where: { currencyCode: code },
    orderBy: { computedAt: "asc" },
    select: { total: true, computedAt: true },
    take: 400,
  });

  const points = snapshots.map((s) => ({
    value: Number(s.total),
    at: s.computedAt,
  }));

  // No snapshot yet: plot today's score so the chart is honest rather than
  // empty — the reading is real, only the history is missing.
  if (points.length === 0) points.push({ value: current, at: new Date() });

  const colour = isCurrencyCode(code) ? CURRENCY_COLOR_VAR[code] : "var(--color-brand-blue)";

  // The score is a 0–100 scale, so the axis is fixed rather than fitted to the
  // data: a curve that rescales itself every time makes two visits
  // incomparable, and 50 must always sit in the middle.
  const x = (i: number) =>
    points.length === 1
      ? WIDTH / 2
      : PAD_X + (i / (points.length - 1)) * (WIDTH - PAD_X * 2);
  const y = (v: number) => PAD_Y + (1 - v / 100) * (HEIGHT - PAD_Y * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");

  const first = points[0]!;
  const last = points.at(-1)!;
  // The year is included as soon as the span crosses one. The history used to
  // be a few days long, where "30 janv. → 11 août" was unambiguous; it now
  // reaches back to 2023, and the same label would read as a single year.
  const spansYears = first.at.getFullYear() !== last.at.getFullYear();
  const dateFmt = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    ...(spansYears ? { year: "numeric" } : {}),
  });

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon="show_chart" className="mb-0">
          Score dans le temps
        </CardTitle>
        <span className="text-subtle text-[11px]">
          {points.length > 1
            ? `${points.length} relevés · ${dateFmt.format(first.at)} → ${dateFmt.format(last.at)}`
            : "Historique en cours de constitution · un relevé à chaque rafraîchissement"}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[180px] w-full"
        role="img"
        aria-label={`Évolution du score de ${code}`}
      >
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--color-border-app)"
              strokeWidth="1"
              strokeDasharray={tick === 50 ? "4 3" : undefined}
            />
            <text
              x={PAD_X - 6}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-[var(--color-subtle)] font-mono text-[9px]"
            >
              {tick}
            </text>
          </g>
        ))}

        {points.length > 1 ? (
          <path d={path} fill="none" stroke={colour} strokeWidth="2" strokeLinejoin="round" />
        ) : null}

        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={points.length === 1 ? 4 : 2.5} fill={colour} />
        ))}

        <text
          x={x(points.length - 1) + 8}
          y={y(last.value) + 3}
          className="fill-[var(--color-fg)] font-mono text-[11px] font-bold"
        >
          {last.value.toFixed(0)}
        </text>
      </svg>
    </Card>
  );
}
