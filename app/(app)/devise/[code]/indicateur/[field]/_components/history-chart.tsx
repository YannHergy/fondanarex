"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

const RANGES = [
  { key: "3Y", years: 3 },
  { key: "5Y", years: 5 },
  { key: "10Y", years: 10 },
  { key: "MAX", years: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

const WIDTH = 900;
const HEIGHT = 280;
const PAD = 36;

export function HistoryChart({
  points,
  unit,
}: {
  points: { date: string; value: number }[];
  unit?: string;
}) {
  const [range, setRange] = useState<RangeKey>("5Y");

  const filtered = useMemo(() => {
    const active = RANGES.find((r) => r.key === range);
    if (!active?.years) return points;
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - active.years);
    return points.filter((p) => new Date(p.date) >= cutoff);
  }, [points, range]);

  const values = filtered.map((p) => p.value);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const span = max - min || 1;

  const x = (index: number) =>
    PAD + (index / Math.max(1, filtered.length - 1)) * (WIDTH - PAD * 2);
  const y = (value: number) => HEIGHT - PAD - ((value - min) / span) * (HEIGHT - PAD * 2);

  // Step line: policy decisions and quarterly/monthly releases hold their
  // value until the NEXT release, not a straight diagonal toward it.
  const path = filtered
    .map((point, index) => {
      if (index === 0) return `M ${x(index)} ${y(point.value)}`;
      return `L ${x(index)} ${y(filtered[index - 1]!.value)} L ${x(index)} ${y(point.value)}`;
    })
    .join(" ");

  return (
    <div>
      <div className="mb-3 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
              range === r.key
                ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                : "border-border-app text-muted hover:text-fg",
            )}
          >
            {r.key}
          </button>
        ))}
      </div>

      {filtered.length < 2 ? (
        <p className="text-subtle py-10 text-center text-sm">
          Pas assez de points sur cette période pour tracer un graphique.
        </p>
      ) : (
        <>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img">
            <line
              x1={PAD}
              y1={HEIGHT - PAD}
              x2={WIDTH - PAD}
              y2={HEIGHT - PAD}
              stroke="currentColor"
              className="text-border-app"
              strokeWidth={1}
            />
            <text x={PAD} y={PAD - 10} className="fill-subtle text-[11px]">
              {max.toFixed(2)}
              {unit}
            </text>
            <text x={PAD} y={HEIGHT - PAD + 18} className="fill-subtle text-[11px]">
              {min.toFixed(2)}
              {unit}
            </text>
            <path d={path} fill="none" stroke="var(--color-brand-blue)" strokeWidth={2} />
          </svg>
          <div className="text-subtle mt-1 flex justify-between text-[11px]">
            <span>{filtered[0]?.date}</span>
            <span>{filtered[filtered.length - 1]?.date}</span>
          </div>
        </>
      )}
    </div>
  );
}
