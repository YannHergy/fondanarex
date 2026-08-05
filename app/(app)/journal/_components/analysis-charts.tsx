"use client";

import { useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import type { Breakdown } from "@/domain/journal/analytics";
import { histogram, type DeepStats } from "@/domain/journal/deep-stats";
import type { AnalysisRunRow } from "@/lib/analysis-history";
import { cn } from "@/lib/utils";

/**
 * The four charts that turn a figure into an understanding.
 *
 * Every one of them draws numbers already computed and tested elsewhere — a
 * chart here is a second way of showing the same value, never a second way of
 * calculating it.
 *
 * Deliberately absent: a gauge or dial around the scalars (SQN, Sharpe,
 * expectancy). Their whole content is the number and its scale, both already
 * on the coloured band. A dial there would be decoration, and decoration on a
 * statistic reads as rigour it does not have.
 */

const W = 900;

function money(value: number): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

function ChartFrame({
  title,
  subtitle,
  children,
  legend,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  legend?: React.ReactNode;
}) {
  return (
    <div className="border-border-app bg-bg rounded-lg border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-fg text-sm font-semibold">{title}</p>
          <p className="text-subtle mt-0.5 text-[11px] leading-relaxed">{subtitle}</p>
        </div>
        {legend}
      </div>
      {children}
    </div>
  );
}

function LegendItem({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="text-subtle flex items-center gap-1.5 text-[11px]">
      <span className="h-0.5 w-4 rounded" style={{ backgroundColor: colour }} />
      {label}
    </span>
  );
}

// ── 1. Le cône de Monte-Carlo ─────────────────────────────────────────────

/**
 * The account's real curve against the paths it could have taken.
 *
 * Reshuffling never changes the endpoint — the same trades sum to the same
 * total — so every simulated path converges on the same last point. That is
 * the chart's whole argument: the destination was fixed, only the journey was
 * luck, and the spread in between is the ride the trader has not yet felt.
 */
export function MonteCarloCone({ stats }: { stats: DeepStats }) {
  const H = 260;
  const PAD_L = 56;
  const PAD_R = 14;
  const PAD_T = 12;
  const PAD_B = 24;

  const model = useMemo(() => {
    const mc = stats.monteCarlo;
    if (!mc || mc.paths.length === 0) return null;

    // Built with reduce rather than a running variable mutated inside map:
    // the lint rule is right that assigning during render is a trap, and the
    // fold expresses the running total more plainly anyway.
    const actual = stats.results.reduce<number[]>(
      (curve, value) => [...curve, (curve.at(-1) ?? 0) + value],
      [],
    );

    const all = [0, ...mc.paths.flat(), ...actual];
    const low = Math.min(...all);
    const high = Math.max(...all);
    const pad = (high - low || 1) * 0.08;

    return { paths: mc.paths, actual, min: low - pad, max: high + pad, count: actual.length };
  }, [stats]);

  if (!model) return null;

  const { paths, actual, min, max, count } = model;

  const x = (index: number) => PAD_L + (index / Math.max(count - 1, 1)) * (W - PAD_L - PAD_R);
  const y = (value: number) => PAD_T + (1 - (value - min) / (max - min)) * (H - PAD_T - PAD_B);
  const line = (values: number[]) =>
    values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");

  const ticks = [max, (max + min) / 2, min];

  return (
    <ChartFrame
      title="Cône de Monte-Carlo"
      subtitle={`Ton parcours réel contre ${paths.length} des ${stats.monteCarlo?.iterations} ordres simulés. Toutes les courbes finissent au même point : remélanger l'ordre ne change pas la somme, seulement le chemin.`}
      legend={
        <div className="flex flex-col gap-1">
          <LegendItem colour="var(--color-brand-blue)" label="Ton parcours réel" />
          <LegendItem colour="var(--color-subtle)" label="Ordres simulés" />
        </div>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[260px] w-full" role="img" aria-label="Cône de Monte-Carlo">
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
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
              {money(tick)}
            </text>
          </g>
        ))}

        {/* Zéro appuyé : c'est la ligne qui sépare un compte gagnant d'un perdant. */}
        {min < 0 && max > 0 ? (
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={y(0)}
            y2={y(0)}
            stroke="var(--color-border-strong)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        ) : null}

        {paths.map((path, index) => (
          <path
            key={index}
            d={line(path)}
            fill="none"
            stroke="var(--color-subtle)"
            strokeWidth="1"
            strokeOpacity="0.18"
          />
        ))}

        <path
          d={line(actual)}
          fill="none"
          stroke="var(--color-brand-blue)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>

      <p className="text-subtle mt-1 text-[10px]">
        Axe horizontal : les {count} trades, dans l&apos;ordre.
      </p>
    </ChartFrame>
  );
}

// ── 2. La distribution des résultats ──────────────────────────────────────

/**
 * The shape of the system, in one picture.
 *
 * A cluster of small losses on the left and a few isolated wins far right is
 * what a 27% win rate with a 3.5:1 payoff actually looks like. Read as two
 * separate numbers that fact stays abstract; read as a shape it is obvious.
 */
export function ResultsHistogram({ stats }: { stats: DeepStats }) {
  const H = 220;
  const PAD_L = 40;
  const PAD_R = 14;
  const PAD_T = 14;
  const PAD_B = 34;

  const [hover, setHover] = useState<number | null>(null);

  const bins = useMemo(() => {
    // Square-root rule, clamped: fewer than five bars shows no shape, more than
    // twelve on a short journal shows one trade per bar and no shape either.
    const count = Math.max(5, Math.min(12, Math.ceil(Math.sqrt(stats.results.length))));
    return histogram(stats.results, count);
  }, [stats.results]);

  if (bins.length === 0) return null;

  const tallest = Math.max(...bins.map((bin) => bin.count), 1);
  const width = (W - PAD_L - PAD_R) / bins.length;
  const y = (count: number) => PAD_T + (1 - count / tallest) * (H - PAD_T - PAD_B);

  const colourOf = (from: number, to: number) => {
    if (to <= 0) return "var(--color-brand-red)";
    if (from >= 0) return "var(--color-brand-green)";
    // A bin straddling zero holds both, so it claims neither colour.
    return "var(--color-brand-amber)";
  };

  const varX =
    stats.var95 === null
      ? null
      : PAD_L +
        ((stats.var95 - bins[0]!.from) / (bins.at(-1)!.to - bins[0]!.from || 1)) *
          (W - PAD_L - PAD_R);

  return (
    <ChartFrame
      title="Distribution de tes résultats"
      subtitle="Chaque barre compte les trades dont le résultat tombe dans cette tranche. La forme dit ce que deux moyennes ne disent pas."
      legend={
        <div className="flex flex-col gap-1">
          <LegendItem colour="var(--color-brand-green)" label="Tranches gagnantes" />
          <LegendItem colour="var(--color-brand-red)" label="Tranches perdantes" />
        </div>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[220px] w-full" role="img" aria-label="Distribution des résultats">
        {[tallest, Math.round(tallest / 2), 0].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
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
              {tick}
            </text>
          </g>
        ))}

        {bins.map((bin, index) => {
          const barX = PAD_L + index * width;
          const barY = y(bin.count);
          return (
            <g key={index} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)}>
              {/* Cible de survol pleine hauteur : viser une barre de 4 pixels
                  de haut est impossible. */}
              <rect x={barX} y={PAD_T} width={width} height={H - PAD_T - PAD_B} fill="transparent" />
              <rect
                x={barX + 2}
                y={barY}
                width={Math.max(width - 4, 1)}
                height={H - PAD_B - barY}
                rx="3"
                fill={colourOf(bin.from, bin.to)}
                fillOpacity={hover === null || hover === index ? 0.85 : 0.35}
              />
              <text
                x={barX + width / 2}
                y={H - PAD_B + 13}
                textAnchor="middle"
                className="fill-[var(--color-subtle)] font-mono text-[9px]"
              >
                {money(bin.from)}
              </text>
            </g>
          );
        })}

        {varX !== null ? (
          <g>
            <line
              x1={varX}
              x2={varX}
              y1={PAD_T}
              y2={H - PAD_B}
              stroke="var(--color-brand-red)"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            <text
              x={varX + 4}
              y={PAD_T + 9}
              className="fill-[var(--color-brand-red)] text-[9px] font-semibold"
            >
              VaR 95 %
            </text>
          </g>
        ) : null}
      </svg>

      {hover !== null && bins[hover] ? (
        <p className="text-muted mt-1 text-[11px]">
          <span className="text-fg font-semibold">{bins[hover]!.count} trade
            {bins[hover]!.count > 1 ? "s" : ""}</span> entre {money(bins[hover]!.from)} et{" "}
          {money(bins[hover]!.to)}
        </p>
      ) : (
        <p className="text-subtle mt-1 text-[10px]">
          Le trait rouge marque la VaR à 95 % : seuls 5 % de tes trades font pire.
        </p>
      )}
    </ChartFrame>
  );
}

// ── 3. Résultats par découpage ────────────────────────────────────────────

/**
 * Diverging bars around a zero axis.
 *
 * Chosen over a table because the question is "what makes money and what costs
 * it", and a bar crossing to the left answers it without reading a number.
 */
export function BreakdownBars({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: Breakdown[];
}) {
  if (rows.length === 0) return null;

  const widest = Math.max(...rows.map((row) => Math.abs(row.net)), 1);

  return (
    <ChartFrame title={title} subtitle={subtitle}>
      <div className="space-y-1.5">
        {rows.map((row) => {
          const share = (Math.abs(row.net) / widest) * 50;
          const positive = row.net >= 0;

          return (
            <div key={row.key} className="flex items-center gap-2">
              <span className="text-muted w-24 shrink-0 truncate text-xs">{row.key}</span>

              <div className="relative h-5 flex-1">
                {/* Axe zéro au centre : la longueur seule porte le signe. */}
                <div className="bg-border-strong absolute top-0 bottom-0 left-1/2 w-px" />
                <div
                  className={cn(
                    "absolute top-1/2 h-3.5 -translate-y-1/2 rounded-sm",
                    positive ? "bg-brand-green/70" : "bg-brand-red/70",
                  )}
                  style={
                    positive
                      ? { left: "50%", width: `${share}%` }
                      : { right: "50%", width: `${share}%` }
                  }
                />
              </div>

              <span
                className={cn(
                  "w-20 shrink-0 text-right font-mono text-xs font-semibold",
                  positive ? "text-brand-green" : "text-brand-red",
                )}
              >
                {positive ? "+" : ""}
                {money(row.net)}
              </span>
              <span className="text-subtle w-24 shrink-0 text-right text-[10px]">
                {row.trades} trades · {row.winRate} %
              </span>
            </div>
          );
        })}
      </div>
    </ChartFrame>
  );
}

// ── 4. L'évolution entre analyses ─────────────────────────────────────────

const TRACKED = [
  { key: "sqn", label: "SQN", better: "up" },
  { key: "expectancy", label: "Espérance", better: "up" },
  { key: "payoffRatio", label: "Gain/perte", better: "up" },
  { key: "winRate", label: "Réussite %", better: "up" },
  { key: "sharpe", label: "Sharpe", better: "up" },
  { key: "maxDrawdown", label: "Drawdown", better: "down" },
] as const;

type TrackedKey = (typeof TRACKED)[number]["key"];

/**
 * One measure across saved analyses.
 *
 * The reason the history exists: a single SQN says where you stand, a line of
 * them says whether you are getting better. Runs are drawn oldest-first even
 * though the list reads newest-first, because a line that improves must climb
 * to the right.
 */
export function EvolutionChart({ runs }: { runs: AnalysisRunRow[] }) {
  const H = 200;
  const PAD_L = 52;
  const PAD_R = 14;
  const PAD_T = 14;
  const PAD_B = 26;

  const [metric, setMetric] = useState<TrackedKey>("sqn");
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(
    () =>
      [...runs]
        .reverse()
        .map((run) => ({ at: run.createdAt, value: run[metric] as number | null, trades: run.tradeCount }))
        .filter((point): point is { at: Date; value: number; trades: number } => point.value !== null),
    [runs, metric],
  );

  const tracked = TRACKED.find((entry) => entry.key === metric)!;

  if (points.length < 2) {
    return (
      <ChartFrame
        title="Évolution entre analyses"
        subtitle="Il faut au moins deux analyses enregistrées pour tracer une progression."
      >
        <p className="text-subtle py-6 text-center text-xs">
          {points.length === 0
            ? "Aucune analyse enregistrée pour cette mesure."
            : "Une seule analyse enregistrée. Relance-en une plus tard pour voir la tendance."}
        </p>
      </ChartFrame>
    );
  }

  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low || Math.abs(high) * 0.1 || 1) * 0.15;
  const min = low - pad;
  const max = high + pad;

  const x = (index: number) => PAD_L + (index / (points.length - 1)) * (W - PAD_L - PAD_R);
  const y = (value: number) => PAD_T + (1 - (value - min) / (max - min)) * (H - PAD_T - PAD_B);

  const first = points[0]!.value;
  const last = points.at(-1)!.value;
  const delta = last - first;
  // "Better" is not always "higher": a falling drawdown is progress.
  const improved = tracked.better === "up" ? delta > 0 : delta < 0;
  const flat = Math.abs(delta) < 1e-9;

  const active = hover === null ? null : points[hover];

  return (
    <ChartFrame
      title="Évolution entre analyses"
      subtitle={`${points.length} analyses enregistrées. Le point le plus à droite est la plus récente.`}
      legend={
        <div className="flex flex-wrap gap-1">
          {TRACKED.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setMetric(entry.key)}
              className={cn(
                "rounded px-2 py-1 text-[11px] font-semibold transition-colors",
                metric === entry.key
                  ? "bg-brand-blue text-white"
                  : "text-subtle hover:text-fg hover:bg-panel",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            "flex items-center gap-1 font-mono text-sm font-semibold",
            flat ? "text-muted" : improved ? "text-brand-green" : "text-brand-red",
          )}
        >
          <Icon name={flat ? "remove" : improved ? "trending_up" : "trending_down"} size={15} />
          {delta > 0 ? "+" : ""}
          {delta.toFixed(2)}
        </span>
        <span className="text-subtle text-[11px]">
          depuis la première analyse ({first.toFixed(2)} → {last.toFixed(2)})
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-[200px] w-full"
        role="img"
        aria-label={`Évolution de ${tracked.label}`}
        onMouseMove={(event) => {
          const box = svgRef.current?.getBoundingClientRect();
          if (!box) return;
          const cursor = ((event.clientX - box.left) / box.width) * W;
          let nearest = 0;
          let best = Infinity;
          points.forEach((_, index) => {
            const distance = Math.abs(x(index) - cursor);
            if (distance < best) {
              best = distance;
              nearest = index;
            }
          });
          setHover(nearest);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {[max, (max + min) / 2, min].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
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
              {tick.toFixed(2)}
            </text>
          </g>
        ))}

        <path
          d={points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.value)}`).join(" ")}
          fill="none"
          stroke={
            flat
              ? "var(--color-muted)"
              : improved
                ? "var(--color-brand-green)"
                : "var(--color-brand-red)"
          }
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {points.map((point, index) => (
          <circle
            key={index}
            cx={x(index)}
            cy={y(point.value)}
            r={hover === index ? 5 : 3.5}
            fill="var(--color-panel)"
            stroke={
              flat
                ? "var(--color-muted)"
                : improved
                  ? "var(--color-brand-green)"
                  : "var(--color-brand-red)"
            }
            strokeWidth="2"
          />
        ))}
      </svg>

      <p className="text-subtle mt-1 text-[11px]">
        {active
          ? `${active.at.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })} · ${tracked.label} ${active.value.toFixed(2)} · sur ${active.trades} trades`
          : `Survole un point pour sa date. ${tracked.better === "down" ? "Pour cette mesure, baisser est un progrès." : "Pour cette mesure, monter est un progrès."}`}
      </p>
    </ChartFrame>
  );
}
