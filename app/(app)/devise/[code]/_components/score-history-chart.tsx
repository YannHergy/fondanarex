"use client";

import { useRef, useState } from "react";

/**
 * The interactive half of ScoreHistory.
 *
 * Split out as a client component purely so the curve can be hovered: its
 * parent reads ScoreSnapshot from the database and must stay on the server.
 * Everything about the drawing lives here, including the fixed 0-100 axis —
 * see the note on `y` for why it is not fitted to the data.
 */

const WIDTH = 720;
const HEIGHT = 180;
const PAD_X = 34;
const PAD_Y = 16;

export interface ScorePoint {
  /** ISO timestamp — RSC serialises a Date, but the string keeps the boundary explicit. */
  at: string;
  value: number;
}

/** Day + short month + year, e.g. "31 janv. 2023" — the history spans years. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ScoreHistoryChart({
  points,
  colour,
  code,
}: {
  points: ScorePoint[];
  colour: string;
  code: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const x = (i: number) =>
    points.length === 1 ? WIDTH / 2 : PAD_X + (i / (points.length - 1)) * (WIDTH - PAD_X * 2);
  // The score is a 0–100 scale, so the axis is fixed rather than fitted to the
  // data: a curve that rescales itself every time makes two visits
  // incomparable, and 50 must always sit in the middle.
  const y = (v: number) => PAD_Y + (1 - v / 100) * (HEIGHT - PAD_Y * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");

  function handlePointerMove(clientX: number) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const relativeX = ((clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (relativeX - PAD_X) / (WIDTH - PAD_X * 2);
    const nearest = Math.round(ratio * (points.length - 1));
    setHoverIndex(Math.min(points.length - 1, Math.max(0, nearest)));
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const last = points.at(-1)!;

  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[180px] w-full cursor-crosshair"
        role="img"
        aria-label={`Évolution du score de ${code}`}
        onMouseMove={(e) => handlePointerMove(e.clientX)}
        onMouseLeave={() => setHoverIndex(null)}
        onTouchMove={(e) => {
          const touch = e.touches[0];
          if (touch) handlePointerMove(touch.clientX);
        }}
        onTouchEnd={() => setHoverIndex(null)}
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

        {/* A dot per reading only while the series is short enough for them to
            read as points rather than a thick smear — a monthly history back
            to 2023 is dense enough that the line alone is clearer. */}
        {points.length <= 20
          ? points.map((p, i) => (
              <circle
                key={p.at}
                cx={x(i)}
                cy={y(p.value)}
                r={points.length === 1 ? 4 : 2.5}
                fill={colour}
              />
            ))
          : null}

        {hovered && hoverIndex !== null ? (
          <>
            <line
              x1={x(hoverIndex)}
              y1={PAD_Y}
              x2={x(hoverIndex)}
              y2={HEIGHT - PAD_Y}
              stroke="var(--color-border-strong)"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <circle
              cx={x(hoverIndex)}
              cy={y(hovered.value)}
              r={4}
              fill={colour}
              stroke="var(--color-bg)"
              strokeWidth={2}
            />
          </>
        ) : null}

        {/* The trailing value label is dropped while hovering: the two sit on
            top of each other at the right edge of the curve. */}
        {hovered ? null : (
          <text
            x={x(points.length - 1) + 8}
            y={y(last.value) + 3}
            className="fill-[var(--color-fg)] font-mono text-[11px] font-bold"
          >
            {last.value.toFixed(0)}
          </text>
        )}
      </svg>

      <div className="border-border-app bg-panel mt-2 flex h-8 items-center justify-center rounded border text-xs">
        {hovered ? (
          <span className="text-fg font-mono font-semibold">
            {formatDate(hovered.at)} —{" "}
            <span style={{ color: colour }}>{hovered.value.toFixed(0)}</span>
          </span>
        ) : (
          <span className="text-subtle">Survolez la courbe pour lire un score</span>
        )}
      </div>
    </>
  );
}
