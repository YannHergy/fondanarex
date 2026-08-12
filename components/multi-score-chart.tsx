"use client";

import { useRef, useState } from "react";

import { CURRENCY_COLOR_VAR, cn, isCurrencyCode } from "@/lib/utils";

/**
 * Plusieurs courbes de score superposées sur une même échelle.
 *
 * Le graphique par devise (score-history-chart.tsx) colore sa ligne selon la
 * zone traversée : une seule série, la couleur peut porter le verdict. Ici la
 * couleur porte l'IDENTITÉ de la devise — c'est la seule façon de distinguer
 * huit lignes — donc les zones de verdict restent en fond et chaque série
 * garde la couleur que le reste de l'application lui attribue déjà
 * (CURRENCY_COLOR_VAR), la même que sur le radar et la matrice de force.
 *
 * L'identité n'est jamais portée par la couleur seule : une légende est
 * toujours présente, et le survol nomme chaque devise avec sa valeur.
 *
 * Les séries n'ont pas forcément la même longueur ni les mêmes dates — une
 * devise branchée plus tard a moins de points. L'axe X est donc un axe de
 * TEMPS réel, pas un index de tableau, sinon deux séries de longueurs
 * différentes seraient étirées l'une sur l'autre et un creux de 2023 se
 * retrouverait aligné avec un creux de 2025.
 */

const WIDTH = 720;
const PAD_LEFT = 34;
const PAD_RIGHT = 62;
const PAD_Y = 16;

const ZONES = [
  { from: 60, to: 100, label: "Achat", colour: "var(--color-brand-green)" },
  { from: 45, to: 60, label: "Neutre", colour: "var(--color-brand-amber)" },
  { from: 0, to: 45, label: "Vente", colour: "var(--color-brand-red)" },
] as const;

export interface SeriesPoint {
  at: string;
  value: number;
}

export interface CurrencySeries {
  code: string;
  points: SeriesPoint[];
}

function colourOf(code: string): string {
  return isCurrencyCode(code) ? CURRENCY_COLOR_VAR[code] : "var(--color-brand-blue)";
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function MultiScoreChart({
  series,
  height = 260,
}: {
  series: CurrencySeries[];
  height?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const withPoints = series.filter((s) => s.points.length > 0);
  if (withPoints.length === 0) {
    return (
      <p className="text-muted py-8 text-center text-sm">
        Aucun historique de score à afficher pour cette sélection.
      </p>
    );
  }

  const allTimes = withPoints.flatMap((s) => s.points.map((p) => new Date(p.at).getTime()));
  const allValues = withPoints.flatMap((s) => s.points.map((p) => p.value));
  const tMin = Math.min(...allTimes);
  const tMax = Math.max(...allTimes);
  const vLo = Math.min(...allValues);
  const vHi = Math.max(...allValues);

  // Marge de 8% puis arrondi au multiple de 5, avec un minimum de 25 points
  // d'amplitude : sans plancher, huit devises groupées entre 48 et 55 seraient
  // dilatées jusqu'à faire passer un écart de 2 points pour un gouffre.
  const pad = Math.max(2, (vHi - vLo) * 0.08);
  let min = Math.max(0, Math.floor((vLo - pad) / 5) * 5);
  let max = Math.min(100, Math.ceil((vHi + pad) / 5) * 5);
  if (max - min < 25) {
    min = Math.max(0, min - (25 - (max - min)) / 2);
    max = Math.min(100, min + 25);
  }

  const x = (ms: number) =>
    tMax === tMin
      ? (PAD_LEFT + WIDTH - PAD_RIGHT) / 2
      : PAD_LEFT + ((ms - tMin) / (tMax - tMin)) * (WIDTH - PAD_LEFT - PAD_RIGHT);
  const y = (v: number) => PAD_Y + (1 - (v - min) / (max - min)) * (height - PAD_Y * 2);

  const step = max - min > 50 ? 25 : max - min > 30 ? 10 : 5;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);

  function handleMove(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relative = ((clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (relative - PAD_LEFT) / (WIDTH - PAD_LEFT - PAD_RIGHT);
    setHoverX(Math.min(1, Math.max(0, ratio)));
  }

  const hoverMs = hoverX === null ? null : tMin + hoverX * (tMax - tMin);

  /** Le relevé de la série le plus proche dans le temps du curseur. */
  function nearest(s: CurrencySeries): SeriesPoint | null {
    if (hoverMs === null) return null;
    let best: SeriesPoint | null = null;
    let bestGap = Infinity;
    for (const p of s.points) {
      const gap = Math.abs(new Date(p.at).getTime() - hoverMs);
      if (gap < bestGap) {
        bestGap = gap;
        best = p;
      }
    }
    return best;
  }

  const readout = withPoints
    .map((s) => ({ code: s.code, point: nearest(s) ?? s.points.at(-1)! }))
    .sort((a, b) => b.point.value - a.point.value);

  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="h-auto w-full cursor-crosshair"
        role="img"
        aria-label={`Scores comparés : ${withPoints.map((s) => s.code).join(", ")}`}
        onMouseMove={(e) => handleMove(e.clientX)}
        onMouseLeave={() => setHoverX(null)}
        onTouchMove={(e) => {
          const touch = e.touches[0];
          if (touch) handleMove(touch.clientX);
        }}
        onTouchEnd={() => setHoverX(null)}
      >
        {ZONES.map((zone) => {
          const top = Math.min(zone.to, max);
          const bottom = Math.max(zone.from, min);
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
                opacity={0.06}
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

        {withPoints.map((s) => {
          const ordered = [...s.points].sort(
            (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
          );
          const d = ordered
            .map((p, i) => `${i === 0 ? "M" : "L"} ${x(new Date(p.at).getTime())} ${y(p.value)}`)
            .join(" ");
          return (
            <path
              key={s.code}
              d={d}
              fill="none"
              stroke={colourOf(s.code)}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {hoverMs !== null ? (
          <>
            <line
              x1={x(hoverMs)}
              y1={PAD_Y}
              x2={x(hoverMs)}
              y2={height - PAD_Y}
              stroke="var(--color-border-strong)"
              strokeWidth={1}
            />
            {readout.map((r) => (
              <circle
                key={r.code}
                cx={x(new Date(r.point.at).getTime())}
                cy={y(r.point.value)}
                r={4}
                fill={colourOf(r.code)}
                stroke="var(--color-bg)"
                strokeWidth={2}
              />
            ))}
          </>
        ) : null}
      </svg>

      {/* Légende toujours présente : huit lignes ne se distinguent pas par la
          couleur seule, et un lecteur daltonien ne les distinguerait pas du
          tout. Elle double aussi de relevé au survol. */}
      <div className="border-border-app bg-panel mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 rounded border px-3 py-2">
        <span className="text-subtle mr-1 font-mono text-[10px]">
          {hoverMs !== null ? formatDate(hoverMs) : "Dernier relevé"}
        </span>
        {readout.map((r) => (
          <span key={r.code} className="flex items-center gap-1.5 font-mono text-[11px]">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: colourOf(r.code) }}
            />
            <span className="text-muted">{r.code}</span>
            <span className={cn("text-fg font-semibold")}>{r.point.value.toFixed(0)}</span>
          </span>
        ))}
      </div>
    </>
  );
}
