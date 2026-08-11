"use client";

import { useId, useRef, useState } from "react";

import { scoreVerdict } from "@/lib/score-display";

/**
 * The interactive half of ScoreHistory.
 *
 * Split out as a client component purely so the curve can be hovered: its
 * parent reads ScoreSnapshot from the database and must stay on the server.
 *
 * THE SVG MUST NOT CARRY A FIXED HEIGHT. With `h-[180px]` against a 720x180
 * viewBox, a wider container letterboxes the drawing — it rendered 720px wide
 * inside a 1070px box, centred, leaving 175px of dead space each side — while
 * the pointer maths mapped the cursor across the FULL element width. The
 * crosshair landed a fixed distance left of the cursor. `h-auto w-full` keeps
 * the element's aspect ratio equal to the viewBox's, so viewBox units and
 * client pixels stay proportional and the crosshair tracks exactly.
 */

const WIDTH = 720;
const PAD_LEFT = 34;
/** Room for the zone labels ("Achat" / "Neutre" / "Vente") in the right margin. */
const PAD_RIGHT = 62;
const PAD_Y = 16;

/**
 * The three verdict zones, collapsed from the five the cards show.
 *
 * `getScoreLabel` cuts at 30/45/60/70, and the app paints Strong Buy cyan
 * against Buy's green. Those two measured ΔE 14.7 against each other in normal
 * vision — below the 15 floor, so as adjacent BANDS they would have been hard
 * to tell apart even for a full-colour reader. Merging the two buy grades and
 * the two sell grades leaves three zones whose worst adjacent pair measures
 * ΔE 22.0 normal / 11.3 deuteranopia, comfortably separated.
 */
const ZONES = [
  { from: 60, to: 100, label: "Achat", colour: "var(--color-brand-green)" },
  { from: 45, to: 60, label: "Neutre", colour: "var(--color-brand-amber)" },
  { from: 0, to: 45, label: "Vente", colour: "var(--color-brand-red)" },
] as const;

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

/**
 * The visible slice of the 0–100 scale.
 *
 * Drawn full-scale, a series that lives between 39 and 66 uses a quarter of
 * the plot and reads as a flat line — the month-to-month movement, which is
 * the whole point of the chart, disappears. So the axis frames the data
 * instead, padded and snapped to a multiple of 5.
 *
 * Two guards keep the zoom from lying. A minimum span stops a quiet stretch
 * from being magnified into drama, and the range is widened to keep every
 * verdict boundary it can inside view — the bands are what tell a reader
 * whether 58 is good, and a zoom that cropped them would leave a curve with
 * no absolute meaning.
 */
const MIN_SPAN = 30;

function computeDomain(values: number[]): { min: number; max: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(2, (hi - lo) * 0.12);

  let min = Math.floor((lo - pad) / 5) * 5;
  let max = Math.ceil((hi + pad) / 5) * 5;

  if (max - min < MIN_SPAN) {
    const extra = (MIN_SPAN - (max - min)) / 2;
    min = Math.floor((min - extra) / 5) * 5;
    max = Math.ceil((max + extra) / 5) * 5;
  }

  // Keep the thresholds the bands are drawn from in view where the data allows.
  if (lo < 60 && hi >= 45) {
    min = Math.min(min, 40);
    max = Math.max(max, 65);
  }

  return { min: Math.max(0, min), max: Math.min(100, max) };
}

/** Gridline values inside the domain, at a step that yields ~5 lines. */
function computeTicks(min: number, max: number): number[] {
  const step = max - min > 50 ? 25 : max - min > 30 ? 10 : 5;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
}

export function ScoreHistoryChart({
  points,
  code,
  height = 120,
}: {
  points: ScorePoint[];
  code: string;
  /**
   * Plot height in viewBox units — and, because the element is `h-auto`, what
   * sets its rendered height relative to the 720-unit width. The default is
   * the compact card on the currency page; the dedicated page passes a much
   * taller one.
   */
  height?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const domain = computeDomain(points.map((p) => p.value));
  const ticks = computeTicks(domain.min, domain.max);

  const x = (i: number) =>
    points.length === 1
      ? (PAD_LEFT + WIDTH - PAD_RIGHT) / 2
      : PAD_LEFT + (i / (points.length - 1)) * (WIDTH - PAD_LEFT - PAD_RIGHT);
  const y = (v: number) =>
    PAD_Y + (1 - (v - domain.min) / (domain.max - domain.min)) * (height - PAD_Y * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");

  function handlePointerMove(clientX: number) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const relativeX = ((clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (relativeX - PAD_LEFT) / (WIDTH - PAD_LEFT - PAD_RIGHT);
    const nearest = Math.round(ratio * (points.length - 1));
    setHoverIndex(Math.min(points.length - 1, Math.max(0, nearest)));
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const last = points.at(-1)!;
  const shown = hovered ?? last;

  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="h-auto w-full cursor-crosshair"
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
        <defs>
          {/*
            The line takes the colour of the zone it is passing through, shading
            continuously rather than snapping: deep red at the floor, through
            amber across the neutral band, to a pale green at the ceiling.
            Anchored in user space so every stop maps to an actual score.

            Each pure hue sits at the MIDDLE of its band (80 / 52.5 / 22.5), not
            at its edge, so the blend between two hues straddles the boundary
            between their zones. Putting pure green at 70 instead left a score
            of 62 — solidly inside the buy band — drawn in yellow-green, the
            line disagreeing with the band behind it.
          */}
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={y(100)}
            x2="0"
            y2={y(0)}
          >
            <stop offset="0%" stopColor="#5cf0c4" />
            <stop offset="20%" stopColor="var(--color-brand-green)" />
            <stop offset="47.5%" stopColor="var(--color-brand-amber)" />
            <stop offset="77.5%" stopColor="var(--color-brand-red)" />
            <stop offset="100%" stopColor="#a3122e" />
          </linearGradient>
        </defs>

        {/* Zone bands, clipped to the visible slice of the scale. Kept very
            faint — a saturated block behind a thin line would drown it — and
            always LABELLED, never colour alone. A band whose visible sliver is
            too short to hold its label goes unlabelled rather than drawing text
            across its neighbour. */}
        {ZONES.map((zone) => {
          const top = Math.min(zone.to, domain.max);
          const bottom = Math.max(zone.from, domain.min);
          if (top <= bottom) return null;
          const bandHeight = y(bottom) - y(top);
          return (
            <g key={zone.label}>
              <rect
                x={PAD_LEFT}
                y={y(top)}
                width={WIDTH - PAD_LEFT - PAD_RIGHT}
                height={bandHeight}
                fill={zone.colour}
                opacity={0.07}
              />
              {bandHeight >= 14 ? (
                <text
                  x={WIDTH - PAD_RIGHT + 8}
                  y={(y(top) + y(bottom)) / 2 + 3}
                  className="fill-[var(--color-subtle)] text-[9px] font-semibold tracking-wide uppercase"
                >
                  {zone.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* Solid hairlines: a dashed rule reads as a threshold, and the bands
            are what carry the thresholds now. */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--color-border-app)"
              strokeWidth="1"
            />
            <text
              x={PAD_LEFT - 6}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-[var(--color-subtle)] font-mono text-[9px]"
            >
              {tick}
            </text>
          </g>
        ))}

        {points.length > 1 ? (
          <path
            d={path}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="2"
            strokeLinejoin="round"
          />
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
                fill={`url(#${gradientId})`}
              />
            ))
          : null}

        {hovered && hoverIndex !== null ? (
          <>
            <line
              x1={x(hoverIndex)}
              y1={PAD_Y}
              x2={x(hoverIndex)}
              y2={height - PAD_Y}
              stroke="var(--color-border-strong)"
              strokeWidth={1}
            />
            <circle
              cx={x(hoverIndex)}
              cy={y(hovered.value)}
              r={4}
              fill={`url(#${gradientId})`}
              stroke="var(--color-bg)"
              strokeWidth={2}
            />
          </>
        ) : null}
      </svg>

      {/*
        The latest reading stays visible when nothing is hovered, so the
        tooltip enhances the chart rather than gating the only way to read it.

        "Dernier relevé", not "Actuellement": the curve ends at the newest
        SNAPSHOT, while the score in the page header is recomputed live. The
        two legitimately differ between refreshes, and labelling both as "now"
        made the page look like it contradicted itself.
      */}
      <div className="border-border-app bg-panel mt-2 flex h-8 items-center justify-center rounded border text-xs">
        <span className="text-fg font-mono font-semibold">
          {hovered ? formatDate(hovered.at) : "Dernier relevé"} —{" "}
          <span className="text-fg">{shown.value.toFixed(0)}</span>
          <span className="text-subtle"> · {scoreVerdict(shown.value)}</span>
        </span>
      </div>
    </>
  );
}
