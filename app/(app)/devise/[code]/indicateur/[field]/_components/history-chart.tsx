"use client";

import { useRef, useState } from "react";

const WIDTH = 900;
const HEIGHT = 280;
const PAD = 36;

/** Short French month + 2-digit year, e.g. "juil. 26" — compact enough to space out under the axis. */
function formatMonth(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
}

/** Full date for the tooltip, e.g. "juillet 2026". */
function formatFullMonth(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export function HistoryChart({
  points,
  unit,
}: {
  points: { date: string; value: number }[];
  unit?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const values = points.map((p) => p.value);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const span = max - min || 1;

  const x = (index: number) =>
    PAD + (index / Math.max(1, points.length - 1)) * (WIDTH - PAD * 2);
  const y = (value: number) => HEIGHT - PAD - ((value - min) / span) * (HEIGHT - PAD * 2);

  // Step line: policy decisions and quarterly/monthly releases hold their
  // value until the NEXT release, not a straight diagonal toward it.
  const path = points
    .map((point, index) => {
      if (index === 0) return `M ${x(index)} ${y(point.value)}`;
      return `L ${x(index)} ${y(points[index - 1]!.value)} L ${x(index)} ${y(point.value)}`;
    })
    .join(" ");

  // Every point gets a month label under the axis, but drawing all of them
  // (40+ for a deep monthly history) collides into an unreadable smear — so
  // only every Nth label renders, spaced to keep roughly 8-10 visible
  // regardless of how many points are in the series.
  const labelStride = Math.max(1, Math.ceil(points.length / 9));

  function handlePointerMove(clientX: number) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const relativeX = ((clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (relativeX - PAD) / (WIDTH - PAD * 2);
    const nearest = Math.round(ratio * (points.length - 1));
    setHoverIndex(Math.min(points.length - 1, Math.max(0, nearest)));
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div>
      {points.length < 2 ? (
        <p className="text-subtle py-10 text-center text-sm">
          Pas assez de points pour tracer un graphique.
        </p>
      ) : (
        <>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full cursor-crosshair"
            role="img"
            onMouseMove={(e) => handlePointerMove(e.clientX)}
            onMouseLeave={() => setHoverIndex(null)}
            onTouchMove={(e) => {
              const touch = e.touches[0];
              if (touch) handlePointerMove(touch.clientX);
            }}
            onTouchEnd={() => setHoverIndex(null)}
          >
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

            {hovered && hoverIndex !== null ? (
              <>
                <line
                  x1={x(hoverIndex)}
                  y1={PAD - 4}
                  x2={x(hoverIndex)}
                  y2={HEIGHT - PAD}
                  stroke="currentColor"
                  className="text-border-strong"
                  strokeWidth={1}
                  strokeDasharray="3,3"
                />
                <circle
                  cx={x(hoverIndex)}
                  cy={y(hovered.value)}
                  r={4}
                  fill="var(--color-brand-blue)"
                  stroke="var(--color-bg)"
                  strokeWidth={2}
                />
              </>
            ) : null}
          </svg>

          <div className="relative mt-1 h-4 text-[10px]">
            {points.map((point, index) =>
              index % labelStride === 0 || index === points.length - 1 ? (
                <span
                  key={point.date}
                  className="text-subtle absolute -translate-x-1/2"
                  style={{ left: `${(x(index) / WIDTH) * 100}%` }}
                >
                  {formatMonth(point.date)}
                </span>
              ) : null,
            )}
          </div>

          <div className="border-border-app bg-panel mt-2 flex h-8 items-center justify-center rounded border text-xs">
            {hovered ? (
              <span className="text-fg font-mono font-semibold">
                {formatFullMonth(hovered.date)} —{" "}
                <span className="text-brand-blue">
                  {hovered.value.toFixed(2)}
                  {unit}
                </span>
              </span>
            ) : (
              <span className="text-subtle">Survolez le graphique pour voir une valeur exacte</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
