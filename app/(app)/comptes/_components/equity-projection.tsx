"use client";

import { useMemo, useState } from "react";

import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { projectSequence } from "@/domain/risk/trade-sequence";
import { cn } from "@/lib/utils";

/**
 * Projected equity for one account.
 *
 * Not a forecast — a consequence. It answers "if this edge holds, where does
 * this account end up, and does it hit the drawdown limit on the way?" The
 * breach line is the reason the chart exists: a path that reaches the target
 * having passed below it is a path that never happened, because the programme
 * closes the account.
 */

export interface ProjectionAccount {
  id: string;
  name: string;
  color: string;
  initialCapital: number;
  currentCapital: number;
  riskPct: number;
  maxDDPct: number;
  targetPct: number | null;
  setupsPerWeek: number;
  winRatePct: number | null;
  rr: number | null;
}

const WIDTH = 900;
const HEIGHT = 300;
const PAD = { top: 16, right: 56, bottom: 30, left: 58 };

export function EquityProjection({ accounts }: { accounts: ProjectionAccount[] }) {
  const [selectedId, setSelectedId] = useState(accounts[0]?.id ?? "");
  const [horizon, setHorizon] = useState(60);
  const [compound, setCompound] = useState(false);

  const account = accounts.find((entry) => entry.id === selectedId) ?? accounts[0];

  const outcome = useMemo(() => {
    if (!account || account.winRatePct === null || account.rr === null) return null;

    return projectSequence({
      initialCapital: account.currentCapital,
      riskPct: account.riskPct,
      rr: account.rr,
      winRatePct: account.winRatePct,
      maxDDPct: account.maxDDPct,
      targetPct: account.targetPct,
      tradesPerWeek: account.setupsPerWeek,
      tradeCount: horizon,
      compound,
    });
  }, [account, horizon, compound]);

  if (!account) return null;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon="show_chart" className="mb-0">
          Projection de capital
        </CardTitle>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Compte"
            value={account.id}
            onChange={(event) => setSelectedId(event.target.value)}
            className="bg-panel border-border-app text-fg focus:border-brand-blue rounded-lg border px-2.5 py-1 text-xs focus:outline-none"
          >
            {accounts.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>

          <label className="text-subtle flex items-center gap-1.5 text-[11px]">
            Trades
            <input
              type="range"
              min={20}
              max={200}
              step={10}
              value={horizon}
              onChange={(event) => setHorizon(Number(event.target.value))}
              className="w-20"
              aria-label="Nombre de trades projetés"
            />
            <span className="text-muted w-6 font-mono">{horizon}</span>
          </label>

          <label className="text-subtle flex cursor-pointer items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              checked={compound}
              onChange={(event) => setCompound(event.target.checked)}
              className="accent-brand-blue h-3.5 w-3.5"
            />
            Composé
          </label>
        </div>
      </div>

      {!outcome ? (
        <p className="text-subtle py-8 text-center text-sm">
          Aucun historique mesuré pour les entrées autorisées sur ce compte — la projection a
          besoin d&apos;un taux de réussite et d&apos;un R:R.
        </p>
      ) : (
        <>
          <Chart outcome={outcome} color={account.color} />

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Capital final"
              value={`${outcome.finalCapital.toFixed(0)} $`}
              tone={
                outcome.finalCapital > account.currentCapital
                  ? "green"
                  : outcome.finalCapital < account.currentCapital
                    ? "red"
                    : undefined
              }
            />
            <Stat label="Drawdown max" value={`${outcome.maxDrawdown.toFixed(0)} $`} tone="red" />
            <Stat
              label="Cible atteinte"
              value={
                outcome.tradesToTarget === null
                  ? "non"
                  : `${outcome.tradesToTarget} trades`
              }
              sub={outcome.weeksToTarget === null ? undefined : `~${outcome.weeksToTarget} sem.`}
              tone={outcome.tradesToTarget === null ? undefined : "green"}
            />
            <Stat
              label="Limite franchie"
              value={outcome.breachedAt === null ? "non" : `trade ${outcome.breachedAt}`}
              tone={outcome.breachedAt === null ? "green" : "red"}
            />
          </div>

          {outcome.breachedAt !== null ? (
            <p className="text-brand-red mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed">
              <Icon name="warning" size={13} className="mt-0.5 shrink-0" />
              La projection s&apos;arrête au trade {outcome.breachedAt} : la limite de drawdown est
              franchie et le compte serait clôturé. Les trades suivants n&apos;auraient pas lieu.
            </p>
          ) : null}

          <p className="text-subtle mt-2 text-[11px] leading-relaxed">
            Séquence déterministe : les gains et pertes sont répartis régulièrement selon le taux
            de réussite plutôt que tirés au hasard, car l&apos;ordre décide à lui seul si la
            limite est franchie. {compound ? "Taille composée." : "Taille fixe sur le capital de départ."}
          </p>
        </>
      )}
    </Card>
  );
}

function Chart({
  outcome,
  color,
}: {
  outcome: NonNullable<ReturnType<typeof projectSequence>>;
  color: string;
}) {
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const points = outcome.points;
  const count = points.length;

  const levels = [
    outcome.breachLevel,
    ...(outcome.targetLevel === null ? [] : [outcome.targetLevel]),
    points[0]!.capital,
  ];
  const values = points.map((point) => point.capital);
  const min = Math.min(...values, ...levels) * 0.997;
  const max = Math.max(...values, ...levels) * 1.003;
  const range = max - min || 1;

  const xOf = (index: number) => PAD.left + (count <= 1 ? 0 : (index / (count - 1)) * innerW);
  const yOf = (value: number) => PAD.top + innerH - ((value - min) / range) * innerH;

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xOf(index).toFixed(1)},${yOf(point.capital).toFixed(1)}`)
    .join(" ");

  const gridValues = Array.from({ length: 5 }, (_, i) => min + (i / 4) * range);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-64 w-full"
      role="img"
      aria-label={`Projection sur ${count - 1} trades, capital final ${outcome.finalCapital}`}
    >
      {gridValues.map((value) => (
        <g key={value}>
          <line
            x1={PAD.left}
            y1={yOf(value)}
            x2={WIDTH - PAD.right}
            y2={yOf(value)}
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-border-app"
          />
          <text
            x={PAD.left - 6}
            y={yOf(value) + 3}
            textAnchor="end"
            className="fill-subtle text-[9px]"
          >
            {Math.round(value)}
          </text>
        </g>
      ))}

      <line
        x1={PAD.left}
        y1={yOf(points[0]!.capital)}
        x2={WIDTH - PAD.right}
        y2={yOf(points[0]!.capital)}
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="5,4"
        className="text-subtle"
      />

      <line
        x1={PAD.left}
        y1={yOf(outcome.breachLevel)}
        x2={WIDTH - PAD.right}
        y2={yOf(outcome.breachLevel)}
        stroke="currentColor"
        strokeWidth={1.2}
        strokeDasharray="6,3"
        className="text-brand-red"
      />
      <text
        x={WIDTH - PAD.right + 4}
        y={yOf(outcome.breachLevel) + 3}
        className="fill-brand-red text-[9px] font-bold"
      >
        limite
      </text>

      {outcome.targetLevel !== null ? (
        <>
          <line
            x1={PAD.left}
            y1={yOf(outcome.targetLevel)}
            x2={WIDTH - PAD.right}
            y2={yOf(outcome.targetLevel)}
            stroke="currentColor"
            strokeWidth={1.2}
            strokeDasharray="8,3"
            className="text-brand-green"
          />
          <text
            x={WIDTH - PAD.right + 4}
            y={yOf(outcome.targetLevel) + 3}
            className="fill-brand-green text-[9px] font-bold"
          >
            cible
          </text>
        </>
      ) : null}

      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

      {/* Markers only when they stay legible; past a few dozen trades they
       * become a solid band and hide the line they annotate. */}
      {count <= 80
        ? points.map((point, index) =>
            point.win === null ? null : (
              <circle
                key={index}
                cx={xOf(index)}
                cy={yOf(point.capital)}
                r={2.5}
                className={point.win ? "fill-brand-green" : "fill-brand-red"}
              />
            ),
          )
        : null}
    </svg>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="border-border-app bg-panel rounded-lg border p-2.5">
      <p className="text-subtle text-[10px] font-bold tracking-widest uppercase">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-base font-black",
          tone === "green" ? "text-brand-green" : tone === "red" ? "text-brand-red" : "text-fg",
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-subtle text-[10px]">{sub}</p> : null}
    </div>
  );
}
