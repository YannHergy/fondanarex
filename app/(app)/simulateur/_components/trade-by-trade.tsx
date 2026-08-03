"use client";

import { useMemo, useState } from "react";

import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { projectSequence } from "@/domain/risk/trade-sequence";
import { cn } from "@/lib/utils";

/**
 * Simulator 2 — trade by trade.
 *
 * The compound simulator answers "where does this end up". This one answers
 * "what happens on the way", which is a different and usually more important
 * question: a path that reaches the target having passed through the drawdown
 * limit is a path that never happened, because the account was closed.
 */
export function TradeByTradeSimulator({
  defaults,
}: {
  defaults: { capital: number; riskPct: number; rr: number };
}) {
  const [capital, setCapital] = useState(defaults.capital);
  const [riskPct, setRiskPct] = useState(defaults.riskPct);
  const [rr, setRr] = useState(defaults.rr);
  const [winRate, setWinRate] = useState(40);
  const [maxDD, setMaxDD] = useState(8);
  const [target, setTarget] = useState(8);
  const [tradesPerWeek, setTradesPerWeek] = useState(5);
  const [count, setCount] = useState(60);
  const [compound, setCompound] = useState(false);

  const outcome = useMemo(
    () =>
      projectSequence({
        initialCapital: capital,
        riskPct,
        rr,
        winRatePct: winRate,
        maxDDPct: maxDD,
        targetPct: target > 0 ? target : null,
        tradesPerWeek,
        tradeCount: count,
        compound,
      }),
    [capital, riskPct, rr, winRate, maxDD, target, tradesPerWeek, count, compound],
  );

  const net = outcome.finalCapital - capital;

  return (
    <Card>
      <CardTitle icon="timeline">Simulateur 2 — trade par trade</CardTitle>
      <p className="text-subtle -mt-2 mb-4 text-xs">
        Le chemin, pas seulement la destination : la limite de drawdown est vérifiée à chaque
        trade.
      </p>

      <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Capital" value={capital} onChange={setCapital} step={500} />
        <Field label="Risque %" value={riskPct} onChange={setRiskPct} step={0.1} />
        <Field label="R:R" value={rr} onChange={setRr} step={0.5} />
        <Field label="Réussite %" value={winRate} onChange={setWinRate} step={5} />
        <Field label="Drawdown max %" value={maxDD} onChange={setMaxDD} step={1} />
        <Field label="Cible %" value={target} onChange={setTarget} step={1} />
        <Field label="Trades / semaine" value={tradesPerWeek} onChange={setTradesPerWeek} step={1} />
        <Field label="Nombre de trades" value={count} onChange={setCount} step={10} />
      </div>

      <label className="text-subtle mb-4 flex cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={compound}
          onChange={(event) => setCompound(event.target.checked)}
          className="accent-brand-blue h-3.5 w-3.5"
        />
        Taille composée
        <span className="text-subtle/70">
          — sinon dimensionnée sur le capital de départ, comme la plupart des programmes financés
        </span>
      </label>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Capital final"
          value={outcome.finalCapital.toFixed(0)}
          tone={net > 0 ? "green" : net < 0 ? "red" : undefined}
          sub={`${net > 0 ? "+" : ""}${net.toFixed(0)}`}
        />
        <Stat
          label="Drawdown max"
          value={outcome.maxDrawdown.toFixed(0)}
          tone={outcome.maxDrawdown > 0 ? "red" : undefined}
        />
        <Stat
          label="Cible"
          value={outcome.tradesToTarget === null ? "non" : `${outcome.tradesToTarget} tr.`}
          sub={outcome.weeksToTarget === null ? undefined : `~${outcome.weeksToTarget} sem.`}
          tone={outcome.tradesToTarget === null ? undefined : "green"}
        />
        <Stat
          label="Limite"
          value={outcome.breachedAt === null ? "tenue" : `trade ${outcome.breachedAt}`}
          tone={outcome.breachedAt === null ? "green" : "red"}
        />
      </div>

      <Curve outcome={outcome} />

      {outcome.breachedAt !== null ? (
        <p className="text-brand-red mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed">
          <Icon name="warning" size={13} className="mt-0.5 shrink-0" />
          La simulation s&apos;arrête au trade {outcome.breachedAt} : la limite est franchie et le
          compte serait clôturé. Avec ces paramètres, {outcome.wins} gains et {outcome.losses}{" "}
          pertes ne suffisent pas à survivre à la séquence.
        </p>
      ) : null}

      <p className="text-subtle mt-2 text-[11px] leading-relaxed">
        Les gains et pertes sont répartis régulièrement selon le taux de réussite, pas tirés au
        hasard : à résultats identiques, l&apos;ordre décide seul si la limite est franchie, et
        une simulation qui change à chaque rendu ne se compare pas.
      </p>
    </Card>
  );
}

function Curve({ outcome }: { outcome: ReturnType<typeof projectSequence> }) {
  const points = outcome.points;
  if (points.length < 2) return null;

  const W = 900;
  const H = 220;
  const PAD = { top: 12, right: 48, bottom: 20, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const levels = [outcome.breachLevel, ...(outcome.targetLevel === null ? [] : [outcome.targetLevel])];
  const values = points.map((point) => point.capital);
  const min = Math.min(...values, ...levels) * 0.997;
  const max = Math.max(...values, ...levels) * 1.003;
  const range = max - min || 1;

  const xOf = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const yOf = (v: number) => PAD.top + innerH - ((v - min) / range) * innerH;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(p.capital).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-52 w-full"
      role="img"
      aria-label={`Courbe sur ${points.length - 1} trades, capital final ${outcome.finalCapital}`}
    >
      {[0, 0.5, 1].map((f) => (
        <line
          key={f}
          x1={PAD.left}
          y1={PAD.top + innerH * f}
          x2={W - PAD.right}
          y2={PAD.top + innerH * f}
          stroke="currentColor"
          strokeWidth={0.5}
          className="text-border-app"
        />
      ))}

      <line
        x1={PAD.left}
        y1={yOf(outcome.breachLevel)}
        x2={W - PAD.right}
        y2={yOf(outcome.breachLevel)}
        stroke="currentColor"
        strokeWidth={1.2}
        strokeDasharray="6,3"
        className="text-brand-red"
      />
      <text
        x={W - PAD.right + 4}
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
            x2={W - PAD.right}
            y2={yOf(outcome.targetLevel)}
            stroke="currentColor"
            strokeWidth={1.2}
            strokeDasharray="8,3"
            className="text-brand-green"
          />
          <text
            x={W - PAD.right + 4}
            y={yOf(outcome.targetLevel) + 3}
            className="fill-brand-green text-[9px] font-bold"
          >
            cible
          </text>
        </>
      ) : null}

      <path
        d={path}
        fill="none"
        strokeWidth={2}
        strokeLinejoin="round"
        className={outcome.breachedAt === null ? "stroke-brand-blue" : "stroke-brand-red"}
      />
    </svg>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
}) {
  return (
    <label className="block">
      <span className="text-subtle mb-1 block text-[10px] font-bold tracking-widest uppercase">
        {label}
      </span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="bg-panel border-border-app text-fg focus:border-brand-blue w-full rounded-lg border px-2 py-1.5 font-mono text-sm focus:outline-none"
      />
    </label>
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
          "mt-0.5 font-mono text-lg font-black",
          tone === "green" ? "text-brand-green" : tone === "red" ? "text-brand-red" : "text-fg",
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-subtle text-[10px]">{sub}</p> : null}
    </div>
  );
}
