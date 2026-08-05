"use client";

import { useMemo, useRef, useState } from "react";

import {
  equityCurve,
  granularityFor,
  maxDrawdown,
  periodTotals,
  type Granularity,
} from "@/domain/journal/equity";
import type { AccountOption, TradeRow } from "@/lib/journal";
import { cn } from "@/lib/utils";

/**
 * The account's realised balance over time.
 *
 * One series, so no legend — the title names it. The x axis is TIME, not the
 * trade index: a burst of six trades in one afternoon has to look like an
 * afternoon, otherwise the curve invents a tempo the account never had.
 *
 * Period boundaries are drawn as faint verticals with the period's own total
 * underneath, which is what makes "March was the good month" readable without
 * counting points.
 */

// Sized for a full view rather than a strip: this is now a tab of its own, so
// the curve gets the height that makes a drawdown legible instead of a wiggle.
const WIDTH = 960;
const HEIGHT = 380;
const PAD_L = 56;
const PAD_R = 18;
const PAD_T = 16;
const PAD_B = 28;

const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: "par jour",
  week: "par semaine",
  month: "par mois",
};

function money(value: number): string {
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${money(value)}`;
}

export function EquityCurve({
  trades,
  accounts,
}: {
  trades: TradeRow[];
  accounts: AccountOption[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const closed = trades.filter((trade) => trade.closedAt !== null && trade.pnl !== null);

    // A real balance only means something when every trade shown belongs to the
    // same account. Mixed accounts, or trades imported without one, fall back to
    // cumulative P&L from zero — stated in the subtitle rather than implied.
    const accountIds = new Set(closed.map((trade) => trade.accountId));
    const only = accountIds.size === 1 ? [...accountIds][0] : null;
    const account = only ? accounts.find((entry) => entry.id === only) : undefined;
    const startingBalance = account?.initialCapital ?? 0;

    const points = equityCurve(closed, startingBalance);
    const granularity = granularityFor(closed);

    return {
      points,
      granularity,
      periods: periodTotals(closed, granularity),
      drawdown: maxDrawdown(points),
      isBalance: account !== undefined,
      accountName: account?.name ?? null,
    };
  }, [trades, accounts]);

  const { points, periods, granularity, drawdown, isBalance, accountName } = model;

  const scale = useMemo(() => {
    if (points.length < 2) return null;

    const values = points.map((point) => point.balance);
    const low = Math.min(...values);
    const high = Math.max(...values);
    // A flat account would divide by zero; give it a band so the line centres.
    const span = high - low || Math.max(Math.abs(high) * 0.02, 1);
    const pad = span * 0.12;

    const min = low - pad;
    const max = high + pad;

    const t0 = points[0]!.at.getTime();
    const t1 = points.at(-1)!.at.getTime();
    const range = t1 - t0 || 1;

    return {
      min,
      max,
      x: (at: Date) => PAD_L + ((at.getTime() - t0) / range) * (WIDTH - PAD_L - PAD_R),
      y: (value: number) =>
        PAD_T + (1 - (value - min) / (max - min)) * (HEIGHT - PAD_T - PAD_B),
    };
  }, [points]);

  if (points.length < 2 || scale === null) {
    return (
      <p className="text-subtle py-10 text-center text-sm">
        {trades.length === 0
          ? "Aucun trade ne correspond à ces filtres."
          : "La courbe apparaîtra dès qu'au moins deux trades seront clôturés."}
      </p>
    );
  }

  const { x, y, min, max } = scale;

  const line = points.map((point, i) => `${i === 0 ? "M" : "L"} ${x(point.at)} ${y(point.balance)}`).join(" ");
  const area = `${line} L ${x(points.at(-1)!.at)} ${HEIGHT - PAD_B} L ${x(points[0]!.at)} ${HEIGHT - PAD_B} Z`;

  const last = points.at(-1)!;
  const net = last.cumulative;
  const ticks = [max, (max + min) / 2, min];

  const left = PAD_L;
  const right = WIDTH - PAD_R;

  /**
   * Where each period's divider and label go.
   *
   * The label sits at the CENTRE of its band, not on its opening boundary. The
   * first period always opens before the chart does — the curve starts at the
   * first trade, the month started earlier — so a label anchored to its start
   * was drawn off the left edge and February simply vanished. Centring also
   * reads better: the name sits over the stretch it describes.
   *
   * A divider is only drawn where the boundary actually falls inside the plot.
   */
  const bands = periods.map((period, index) => {
    const rawStart = x(period.start);
    const start = Math.max(rawStart, left);
    const next = periods[index + 1];
    const end = next ? Math.min(x(next.start), right) : right;

    return {
      key: period.key,
      label: period.label,
      centre: (start + end) / 2,
      divider: index > 0 && rawStart > left && rawStart < right ? rawStart : null,
    };
  });

  const active = hover === null ? null : points[hover];

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;

    const box = svg.getBoundingClientRect();
    // The svg stretches to its container, so screen pixels must be mapped back
    // into viewBox units before they can be compared with point positions.
    const cursor = ((event.clientX - box.left) / box.width) * WIDTH;

    let nearest = 0;
    let best = Infinity;
    points.forEach((point, i) => {
      const distance = Math.abs(x(point.at) - cursor);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });

    setHover(nearest);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-subtle text-[11px]">
            {isBalance
              ? `Solde réalisé · ${accountName} · découpage ${GRANULARITY_LABEL[granularity]}`
              : `P&L cumulé depuis zéro · découpage ${GRANULARITY_LABEL[granularity]}`}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Sans solde de départ, « solde » et « résultat net » sont le même
              nombre : on n'en affiche qu'un. */}
          {isBalance ? <Figure label="Solde" value={money(last.balance)} /> : null}
          <Figure
            label="Résultat net"
            value={signed(net)}
            tone={net > 0 ? "green" : net < 0 ? "red" : undefined}
          />
          <Figure
            label="Drawdown réalisé"
            value={drawdown === 0 ? "—" : `−${money(drawdown)}`}
            tone={drawdown === 0 ? undefined : "red"}
          />
        </div>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-[380px] w-full"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Évolution du solde du compte dans le temps"
        >
          <defs>
            <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-blue)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-brand-blue)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grille horizontale, volontairement discrète. */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD_L}
                x2={WIDTH - PAD_R}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--color-border-app)"
                strokeWidth="1"
              />
              <text
                x={PAD_L - 8}
                y={y(tick) + 3}
                textAnchor="end"
                className="fill-[var(--color-subtle)] font-mono text-[9px]"
              >
                {Math.round(tick).toLocaleString("fr-FR")}
              </text>
            </g>
          ))}

          {/* Séparateurs de période : la demande explicite, gardés très légers
              pour marquer le mois sans concurrencer la courbe. */}
          {bands.map((band) =>
            band.divider === null ? null : (
              <line
                key={`d-${band.key}`}
                x1={band.divider}
                x2={band.divider}
                y1={PAD_T}
                y2={HEIGHT - PAD_B}
                stroke="var(--color-border-app)"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
            ),
          )}

          {bands.map((band) => (
            <text
              key={`l-${band.key}`}
              x={band.centre}
              y={HEIGHT - PAD_B + 14}
              textAnchor="middle"
              className="fill-[var(--color-subtle)] text-[9px]"
            >
              {band.label}
            </text>
          ))}

          <path d={area} fill="url(#equity-fill)" />
          <path
            d={line}
            fill="none"
            stroke="var(--color-brand-blue)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {active ? (
            <g>
              <line
                x1={x(active.at)}
                x2={x(active.at)}
                y1={PAD_T}
                y2={HEIGHT - PAD_B}
                stroke="var(--color-brand-blue)"
                strokeWidth="1"
                strokeOpacity="0.55"
              />
              {/* Anneau de la couleur du fond : le marqueur reste lisible même
                  posé sur la courbe. */}
              <circle
                cx={x(active.at)}
                cy={y(active.balance)}
                r="5"
                fill="var(--color-brand-blue)"
                stroke="var(--color-panel)"
                strokeWidth="2"
              />
            </g>
          ) : null}
        </svg>

        {active ? (
          <div
            className="border-border-app bg-panel pointer-events-none absolute top-2 z-10 rounded-lg border px-2.5 py-1.5 text-[11px] shadow-lg"
            style={{
              left: `${(x(active.at) / WIDTH) * 100}%`,
              transform:
                x(active.at) > WIDTH * 0.62 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
            }}
          >
            <div className="text-subtle">
              {active.at.toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </div>
            <div className="text-fg font-mono font-semibold">
              {isBalance ? money(active.balance) : signed(active.cumulative)}
            </div>
            {isBalance ? (
              <div
                className={cn(
                  "font-mono",
                  active.cumulative > 0
                    ? "text-brand-green"
                    : active.cumulative < 0
                      ? "text-brand-red"
                      : "text-subtle",
                )}
              >
                {signed(active.cumulative)} cumulé
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Bandeau des totaux par période, le pendant chiffré des séparateurs. */}
      <div className="border-border-app mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t pt-3">
        {periods.map((period) => (
          <div key={period.key}>
            <div className="text-subtle text-[10px] uppercase">{period.label}</div>
            <div
              className={cn(
                "font-mono text-xs font-semibold",
                period.net > 0
                  ? "text-brand-green"
                  : period.net < 0
                    ? "text-brand-red"
                    : "text-muted",
              )}
            >
              {signed(period.net)}
            </div>
            <div className="text-subtle text-[10px]">
              {period.trades} trade{period.trades > 1 ? "s" : ""}
            </div>
          </div>
        ))}

        <div className="ml-auto">
          <div className="text-subtle text-[10px] uppercase">Total</div>
          <div
            className={cn(
              "font-mono text-xs font-semibold",
              net > 0 ? "text-brand-green" : net < 0 ? "text-brand-red" : "text-muted",
            )}
          >
            {signed(net)}
          </div>
        </div>
      </div>
    </>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="text-right">
      <div className="text-subtle text-[10px] uppercase">{label}</div>
      <div
        className={cn(
          "font-mono text-sm font-semibold",
          tone === "green" ? "text-brand-green" : tone === "red" ? "text-brand-red" : "text-fg",
        )}
      >
        {value}
      </div>
    </div>
  );
}
