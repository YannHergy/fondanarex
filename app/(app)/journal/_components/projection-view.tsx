"use client";

import { useMemo, useState } from "react";

import { AssistantPanel } from "@/app/(app)/journal/_components/assistant-panel";
import { Icon } from "@/components/ui/icon";
import { Slider } from "@/app/(app)/simulateur/_components/slider";
import {
  bestSize,
  projectAccount,
  recommend,
  sweepSize,
  type ProjectionResult,
  type Recommendation,
  type SegmentPerformance,
} from "@/domain/journal/projection";
import type { AccountOption, TradeRow } from "@/lib/journal";
import { cn } from "@/lib/utils";

/**
 * Forward projection of a prop-firm account.
 *
 * Computed ENTIRELY in the browser. `projectAccount` is pure and the input is
 * a few dozen numbers, so moving a slider re-simulates four thousand runs in
 * milliseconds — no round trip, no cost, and no chance of the figure on screen
 * disagreeing with the one the assistant is given.
 */

function money(value: number): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

export function ProjectionView({
  trades,
  accounts,
}: {
  trades: TradeRow[];
  accounts: AccountOption[];
}) {
  const closed = useMemo(
    () => trades.filter((trade) => trade.closedAt !== null && trade.pnl !== null),
    [trades],
  );

  const results = useMemo(() => closed.map((trade) => trade.pnl as number), [closed]);

  /** The pace actually traded, from the span of the journal itself. */
  const observedPace = useMemo(() => {
    if (closed.length < 2) return 1;

    const times = closed.map((trade) => (trade.closedAt as Date).getTime()).sort((a, b) => a - b);
    const weeks = (times.at(-1)! - times[0]!) / (7 * 86_400_000);

    return weeks <= 0 ? 1 : Math.round((closed.length / weeks) * 100) / 100;
  }, [closed]);

  const account = accounts[0];

  const [capital, setCapital] = useState(() => account?.initialCapital ?? 5000);
  const [targetPct, setTargetPct] = useState(8);
  const [maxLossPct, setMaxLossPct] = useState(10);
  const [size, setSize] = useState(1);
  const [pace, setPace] = useState(observedPace);

  const segments: SegmentPerformance[] = useMemo(() => {
    const byPair = new Map<string, number[]>();
    for (const trade of closed) {
      const bucket = byPair.get(trade.instrument) ?? [];
      bucket.push(trade.pnl as number);
      byPair.set(trade.instrument, bucket);
    }

    return [...byPair.entries()].map(([key, values]) => ({
      key,
      trades: values.length,
      meanNet: values.reduce((total, value) => total + value, 0) / values.length,
    }));
  }, [closed]);

  const base = { results, capital, targetPct, maxLossPct, tradesPerWeek: pace };

  const projection = useMemo(
    () => projectAccount({ ...base, sizeMultiplier: size }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, capital, targetPct, maxLossPct, pace, size],
  );

  const sweep = useMemo(
    () => sweepSize(base),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, capital, targetPct, maxLossPct, pace],
  );

  const recommendations = useMemo(
    () => recommend({ ...base, sizeMultiplier: size }, { segments, maxMonths: 12, maxFailRate: 25 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, capital, targetPct, maxLossPct, pace, size, segments],
  );

  const optimum = bestSize(sweep);

  if (closed.length < 10) {
    return (
      <div className="py-12 text-center">
        <Icon name="lock" size={30} className="text-subtle mb-3 inline-block" />
        <p className="text-fg text-base font-semibold">
          Encore {10 - closed.length} trade{10 - closed.length > 1 ? "s" : ""} avant de projeter
        </p>
        <p className="text-muted mx-auto mt-2 max-w-lg text-sm leading-relaxed">
          La projection tire au sort parmi tes résultats passés. En dessous d&apos;une dizaine, elle
          repiocherait sans cesse les mêmes deux ou trois trades et te rendrait ta propre histoire
          déguisée en prévision.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-fg text-base font-semibold">Prévision</p>
        <p className="text-subtle mt-0.5 text-xs leading-relaxed">
          Tire au sort de nouveaux trades parmi tes {closed.length} résultats réels et projette ton
          compte. Tout est recalculé instantanément quand tu bouges un curseur.
        </p>
      </div>

      {/* Hypothèse posée une fois, visible en permanence. */}
      <div className="border-brand-amber/40 bg-brand-amber/10 flex items-start gap-2 rounded-lg border p-3">
        <Icon name="info" size={15} className="text-brand-amber mt-0.5 shrink-0" />
        <p className="text-muted text-xs leading-relaxed">
          <strong className="text-brand-amber">Tout ceci suppose que demain ressemble à hier</strong>{" "}
          — même méthode, même marché, même discipline. La projection ne sait pas modéliser ton
          changement de comportement à l&apos;approche de l&apos;objectif ou de la limite. Sur{" "}
          {closed.length} trades, lis des ordres de grandeur, pas des promesses.
        </p>
      </div>

      <div className="border-border-app bg-bg grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Slider
          label="Capital du compte"
          value={capital}
          min={1000}
          max={200_000}
          step={1000}
          suffix=" $"
          format={(value) => money(value)}
          onChange={setCapital}
        />
        <Slider
          label="Objectif à atteindre"
          value={targetPct}
          min={2}
          max={20}
          step={0.5}
          suffix=" %"
          onChange={setTargetPct}
        />
        <Slider
          label="Perte maximale autorisée"
          value={maxLossPct}
          min={2}
          max={20}
          step={0.5}
          suffix=" %"
          onChange={setMaxLossPct}
        />
        <Slider
          label="Taille de position"
          value={size}
          min={0.25}
          max={4}
          step={0.25}
          suffix="×"
          onChange={setSize}
        />
        <Slider
          label="Trades par semaine"
          value={pace}
          min={0.25}
          max={10}
          step={0.25}
          onChange={setPace}
        />
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => {
              setSize(1);
              setPace(observedPace);
            }}
            className="text-subtle hover:text-fg text-xs underline"
          >
            Revenir à ton rythme réel ({observedPace}/semaine, taille ×1)
          </button>
        </div>
      </div>

      <Outcome projection={projection} capital={capital} maxLossPct={maxLossPct} />

      <FanChart projection={projection} capital={capital} targetPct={targetPct} maxLossPct={maxLossPct} />

      <SizeSweep points={sweep} current={size} optimum={optimum?.sizeMultiplier ?? null} />

      <Recommendations items={recommendations} />

      <AssistantPanel
        context={{
          trades: closed.length,
          expectancy:
            Math.round((results.reduce((a, b) => a + b, 0) / results.length) * 100) / 100,
          observedPace,
          capital,
          targetPct,
          maxLossPct,
          size,
          pace,
          projection: {
            passRate: projection.passRate,
            failRate: projection.failRate,
            monthsToTarget: projection.medianMonthsToTarget,
            tradesToTarget: projection.medianTradesToTarget,
            p95MaxDrawdown: projection.p95MaxDrawdown,
          },
          sweep: sweep.map((point) => ({
            size: point.sizeMultiplier,
            passRate: point.passRate,
            failRate: point.failRate,
            months: point.monthsToTarget,
            drawdown: point.p95MaxDrawdown,
          })),
          recommendations: recommendations.slice(0, 10).map((entry) => ({
            label: entry.label,
            evidence: entry.evidence,
            sampleSize: entry.sampleSize,
            months: entry.monthsToTarget,
            passRate: entry.passRate,
            failRate: entry.failRate,
          })),
          segments,
        }}
      />
    </div>
  );
}

// ── Résultat ──────────────────────────────────────────────────────────────

function Outcome({
  projection,
  capital,
  maxLossPct,
}: {
  projection: ProjectionResult;
  capital: number;
  maxLossPct: number;
}) {
  const cells = [
    {
      label: "Validation",
      value: `${projection.passRate} %`,
      tone: projection.passRate >= 80 ? "green" : projection.passRate >= 60 ? "amber" : "red",
      hint: "atteint l'objectif avant la limite",
    },
    {
      label: "Élimination",
      value: `${projection.failRate} %`,
      tone: projection.failRate <= 10 ? "green" : projection.failRate <= 25 ? "amber" : "red",
      hint: `touche les −${money(capital * (maxLossPct / 100))} $ d'abord`,
    },
    {
      label: "Délai médian",
      value:
        projection.medianMonthsToTarget === null
          ? "—"
          : `${projection.medianMonthsToTarget} mois`,
      tone: null,
      hint:
        projection.medianTradesToTarget === null
          ? undefined
          : `${projection.medianTradesToTarget} trades`,
    },
    {
      label: "Drawdown probable",
      value: `−${money(projection.p95MaxDrawdown)} $`,
      tone: projection.p95MaxDrawdown >= capital * (maxLossPct / 100) ? "red" : "amber",
      hint: "95e centile des simulations",
    },
  ] as const;

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="border-border-app bg-bg rounded-lg border p-3">
          <div className="text-subtle text-[10px] uppercase">{cell.label}</div>
          <div
            className={cn(
              "font-mono text-xl font-bold",
              cell.tone === "green"
                ? "text-brand-green"
                : cell.tone === "amber"
                  ? "text-brand-amber"
                  : cell.tone === "red"
                    ? "text-brand-red"
                    : "text-fg",
            )}
          >
            {cell.value}
          </div>
          {cell.hint ? <div className="text-subtle text-[11px]">{cell.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

// ── Éventail ──────────────────────────────────────────────────────────────

const W = 900;
const H = 280;
const PAD_L = 62;
const PAD_R = 16;
const PAD_T = 14;
const PAD_B = 26;

/**
 * Projected balances, with the two lines that decide the account drawn on top.
 *
 * The target and the limit are the point of the chart: you read how many paths
 * cross the first before touching the second, which is the question, rather
 * than reading a probability and trusting it.
 */
function FanChart({
  projection,
  capital,
  targetPct,
  maxLossPct,
}: {
  projection: ProjectionResult;
  capital: number;
  targetPct: number;
  maxLossPct: number;
}) {
  const target = capital * (1 + targetPct / 100);
  const floor = capital * (1 - maxLossPct / 100);

  // Only as far as the median run needs, plus a margin: four hundred trades of
  // flat line after every run has resolved says nothing.
  const span = Math.min(
    projection.bands.mid.length,
    Math.max((projection.medianTradesToTarget ?? 60) * 2, 40),
  );

  if (projection.paths.length === 0) return null;

  const values = [
    ...projection.bands.low.slice(0, span),
    ...projection.bands.high.slice(0, span),
    target,
    floor,
  ];
  const min = Math.min(...values) * 0.998;
  const max = Math.max(...values) * 1.002;

  const x = (index: number) => PAD_L + (index / Math.max(span - 1, 1)) * (W - PAD_L - PAD_R);
  const y = (value: number) => PAD_T + (1 - (value - min) / (max - min || 1)) * (H - PAD_T - PAD_B);
  const line = (series: number[]) =>
    series
      .slice(0, span)
      .map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`)
      .join(" ");

  return (
    <div className="border-border-app bg-bg rounded-lg border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-fg text-sm font-semibold">Trajectoires projetées</p>
          <p className="text-subtle mt-0.5 text-[11px]">
            {projection.paths.length} tirages sur {projection.iterations}, avec la bande du 5e au
            95e centile.
          </p>
        </div>
        <div className="flex flex-col gap-1 text-[11px]">
          <span className="text-brand-green flex items-center gap-1.5">
            <span className="bg-brand-green h-0.5 w-4 rounded" /> Objectif {money(target)} $
          </span>
          <span className="text-brand-red flex items-center gap-1.5">
            <span className="bg-brand-red h-0.5 w-4 rounded" /> Élimination {money(floor)} $
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="h-[280px] w-full" role="img" aria-label="Trajectoires projetées">
        {[max, capital, min].map((tick) => (
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

        {projection.paths.map((path, index) => (
          <path
            key={index}
            d={line(path)}
            fill="none"
            stroke="var(--color-subtle)"
            strokeWidth="1"
            strokeOpacity="0.16"
          />
        ))}

        <path d={line(projection.bands.mid)} fill="none" stroke="var(--color-brand-blue)" strokeWidth="2.5" />

        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={y(target)}
          y2={y(target)}
          stroke="var(--color-brand-green)"
          strokeWidth="1.5"
          strokeDasharray="5 3"
        />
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={y(floor)}
          y2={y(floor)}
          stroke="var(--color-brand-red)"
          strokeWidth="1.5"
          strokeDasharray="5 3"
        />
      </svg>

      <p className="text-subtle mt-1 text-[10px]">
        Axe horizontal : les {span} premiers trades. Trait bleu : la trajectoire médiane.
      </p>
    </div>
  );
}

// ── Balayage ──────────────────────────────────────────────────────────────

function SizeSweep({
  points,
  current,
  optimum,
}: {
  points: ReturnType<typeof sweepSize>;
  current: number;
  optimum: number | null;
}) {
  return (
    <div className="border-border-app bg-bg rounded-lg border p-4">
      <p className="text-fg text-sm font-semibold">Effet de la taille de position</p>
      <p className="text-subtle mt-0.5 mb-3 text-[11px]">
        Trader plus gros raccourcit le chemin ET augmente le risque d&apos;être éliminé avant. Il
        existe donc une taille optimale, et elle ne se devine pas.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-subtle border-border-app border-b text-left">
              <th className="py-1.5 font-medium">Taille</th>
              <th className="py-1.5 text-right font-medium">Validation</th>
              <th className="py-1.5 text-right font-medium">Élimination</th>
              <th className="py-1.5 text-right font-medium">Délai</th>
              <th className="py-1.5 text-right font-medium">Drawdown 95e</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr
                key={point.sizeMultiplier}
                className={cn(
                  "border-border-app border-b last:border-0",
                  point.sizeMultiplier === current && "bg-brand-blue/10",
                )}
              >
                <td className="text-fg py-1.5 font-mono font-semibold">
                  ×{point.sizeMultiplier}
                  {point.sizeMultiplier === optimum ? (
                    <span className="text-brand-green ml-1.5 text-[10px] font-semibold">
                      OPTIMUM
                    </span>
                  ) : null}
                  {point.sizeMultiplier === current ? (
                    <span className="text-brand-blue ml-1.5 text-[10px]">actuel</span>
                  ) : null}
                </td>
                <td className="text-brand-green py-1.5 text-right font-mono">{point.passRate} %</td>
                <td
                  className={cn(
                    "py-1.5 text-right font-mono",
                    point.failRate > 20 ? "text-brand-red" : "text-muted",
                  )}
                >
                  {point.failRate} %
                </td>
                <td className="text-fg py-1.5 text-right font-mono">
                  {point.monthsToTarget === null ? "—" : `${point.monthsToTarget} mois`}
                </td>
                <td className="text-muted py-1.5 text-right font-mono">
                  −{money(point.p95MaxDrawdown)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Recommandations ───────────────────────────────────────────────────────

const EVIDENCE: Record<
  Recommendation["evidence"],
  { icon: string; tone: string; label: string }
> = {
  arithmetic: {
    icon: "check_circle",
    tone: "text-brand-green",
    label: "Arithmétique — aucune hypothèse",
  },
  observed: { icon: "info", tone: "text-brand-amber", label: "Observé — hypothèse sur le futur" },
  insufficient: { icon: "block", tone: "text-brand-red", label: "Écarté — trop peu d'observations" },
};

function Recommendations({ items }: { items: Recommendation[] }) {
  if (items.length === 0) return null;

  return (
    <div className="border-border-app bg-bg rounded-lg border p-4">
      <p className="text-fg text-sm font-semibold">Ce qui te rapprocherait le plus</p>
      <p className="text-subtle mt-0.5 mb-3 text-[11px]">
        Classé par solidité de la preuve avant la rapidité : un raccourci acheté avec une hypothèse
        ne vaut pas un raccourci acheté avec une position plus grande.
      </p>

      <div className="space-y-1.5">
        {items.slice(0, 8).map((item) => {
          const badge = EVIDENCE[item.evidence];

          return (
            <div key={item.id} className="border-border-app rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-fg text-sm font-semibold">{item.label}</p>
                {item.monthsToTarget !== null ? (
                  <p className="font-mono text-sm">
                    <span className="text-brand-blue font-bold">{item.monthsToTarget} mois</span>
                    <span className="text-subtle ml-2 text-[11px]">
                      validation {item.passRate} % · élimination {item.failRate} %
                    </span>
                  </p>
                ) : null}
              </div>

              <p className={cn("mt-1 flex items-start gap-1.5 text-[11px]", badge.tone)}>
                <Icon name={badge.icon} size={13} className="mt-0.5 shrink-0" />
                <span>
                  <strong>{badge.label}.</strong>{" "}
                  <span className="text-muted">{item.detail}</span>
                </span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
