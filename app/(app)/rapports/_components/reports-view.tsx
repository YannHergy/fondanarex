"use client";

import { useMemo, useState } from "react";

import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { journalStats } from "@/domain/journal/filters";
import {
    byMonth,
    byWeekday,
    drawdown,
    equityCurve,
    filterByPeriod,
    groupPerformance,
    PERIODS,
    streaks,
    type PerformanceRow,
    type PeriodId,
} from "@/domain/journal/reports";
import type { TradeRow } from "@/lib/journal";
import { cn } from "@/lib/utils";

export function ReportsView({ trades, now }: { trades: TradeRow[]; now: string }) {
  const [period, setPeriod] = useState<PeriodId>("all");
  const [accountId, setAccountId] = useState<string>("");

  const nowDate = useMemo(() => new Date(now), [now]);

  const scoped = useMemo(() => {
    const inPeriod = filterByPeriod(trades, period, nowDate);
    return accountId ? inPeriod.filter((t) => (t as TradeRow).accountId === accountId) : inPeriod;
  }, [trades, period, nowDate, accountId]);

  const stats = useMemo(() => journalStats(scoped), [scoped]);
  const curve = useMemo(() => equityCurve(scoped), [scoped]);
  const dd = useMemo(() => drawdown(scoped), [scoped]);
  const run = useMemo(() => streaks(scoped), [scoped]);
  const months = useMemo(() => byMonth(scoped), [scoped]);
  const days = useMemo(() => byWeekday(scoped), [scoped]);

  const accounts = useMemo(() => {
    const ids = new Set(trades.map((t) => t.accountId).filter(Boolean) as string[]);
    return [...ids];
  }, [trades]);

  const byStrategy = useMemo(() => groupPerformance(scoped, (t) => t.strategy), [scoped]);
  const byPair = useMemo(() => groupPerformance(scoped, (t) => t.instrument), [scoped]);
  const bySession = useMemo(() => groupPerformance(scoped, (t) => t.session), [scoped]);
  const byCloseType = useMemo(
    () => groupPerformance(scoped, (t) => (t as TradeRow).closeType),
    [scoped],
  );
  const byEmotion = useMemo(
    () => groupPerformance(scoped, (t) => (t as TradeRow).emotionBefore),
    [scoped],
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Rapports"
        subtitle="Ce que vos trades disent réellement, une fois agrégés"
      >
        <div className="flex flex-wrap gap-2">
          {accounts.length > 0 ? (
            <select
              aria-label="Compte"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              className="bg-panel border-border-app text-muted focus:border-brand-blue rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none"
            >
              <option value="">Tous les comptes</option>
              {accounts.map((id) => (
                <option key={id} value={id}>
                  {id.slice(0, 8)}
                </option>
              ))}
            </select>
          ) : null}

          <div className="border-border-app flex overflow-hidden rounded-lg border">
            {PERIODS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setPeriod(entry.id)}
                className={cn(
                  "px-2.5 py-1.5 text-xs font-semibold transition-colors",
                  period === entry.id
                    ? "bg-brand-blue text-white"
                    : "text-subtle hover:text-fg",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      {stats.closed === 0 ? (
        <Card>
          <p className="text-subtle text-sm">
            {trades.length === 0
              ? "Aucun trade enregistré. Les rapports se construisent à partir du journal."
              : "Aucun trade clôturé sur cette période — un rapport ne peut décrire que des résultats réalisés."}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <Stat
              label="P&L net"
              value={stats.netPnl.toFixed(2)}
              tone={stats.netPnl > 0 ? "green" : stats.netPnl < 0 ? "red" : undefined}
            />
            <Stat label="Trades" value={String(stats.closed)} sub={`${stats.open} ouverts`} />
            <Stat
              label="Réussite"
              value={`${stats.winRate} %`}
              sub={`${stats.wins}V / ${stats.losses}D`}
            />
            <Stat
              label="Facteur profit"
              value={stats.profitFactor === null ? "—" : stats.profitFactor.toFixed(2)}
              sub={stats.profitFactor === null ? "aucune perte" : undefined}
            />
            <Stat label="Espérance" value={stats.expectancy.toFixed(2)} sub="par trade" />
            <Stat
              label="Drawdown max"
              value={dd.maxDrawdown.toFixed(2)}
              sub={
                dd.maxDrawdownPct === null
                  ? undefined
                  : `${dd.maxDrawdownPct.toFixed(1)} % du plus haut`
              }
              tone={dd.maxDrawdown > 0 ? "red" : undefined}
            />
            <Stat
              label="Séries"
              value={`${run.longestWin}V / ${run.longestLoss}D`}
              sub={
                run.currentKind === "none"
                  ? undefined
                  : `en cours : ${run.current}${run.currentKind === "win" ? "V" : "D"}`
              }
            />
          </div>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <CardTitle icon="show_chart" className="mb-0">
                Courbe de capital
              </CardTitle>
              {dd.inDrawdown ? (
                <span className="text-brand-amber flex items-center gap-1 text-[11px]">
                  <Icon name="trending_down" size={12} />
                  {dd.currentDrawdown.toFixed(2)} sous le plus haut
                </span>
              ) : (
                <span className="text-brand-green text-[11px]">Au plus haut</span>
              )}
            </div>
            <EquityChart points={curve} />
            <p className="text-subtle mt-2 text-[11px]">
              Ordonnée par date de <strong>clôture</strong> : un trade réalise son résultat quand
              il se ferme, pas quand il s&apos;ouvre. La courbe part de zéro et suit le P&amp;L
              réalisé — le drawdown est mesuré depuis le plus haut atteint, pas depuis le capital,
              et peut donc dépasser 100 %.
            </p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle icon="calendar_view_week">Par jour de la semaine</CardTitle>
              <DayChart days={days} />
            </Card>

            <Card>
              <CardTitle icon="bar_chart">Par mois</CardTitle>
              {months.length === 0 ? (
                <p className="text-subtle text-sm">Aucun mois clôturé.</p>
              ) : (
                <ul className="space-y-1.5">
                  {months.map((month) => (
                    <li key={month.month} className="flex items-center gap-2 text-xs">
                      <span className="text-muted w-16 font-mono">{month.month}</span>
                      <div className="bg-panel h-2 flex-1 overflow-hidden rounded-full">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            month.pnl >= 0 ? "bg-brand-green" : "bg-brand-red",
                          )}
                          style={{
                            width: `${Math.min(
                              100,
                              (Math.abs(month.pnl) /
                                Math.max(...months.map((m) => Math.abs(m.pnl)), 1)) *
                                100,
                            )}%`,
                          }}
                        />
                      </div>
                      <span
                        className={cn(
                          "w-20 text-right font-mono font-bold",
                          month.pnl > 0
                            ? "text-brand-green"
                            : month.pnl < 0
                              ? "text-brand-red"
                              : "text-subtle",
                        )}
                      >
                        {month.pnl > 0 ? "+" : ""}
                        {month.pnl.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <PerformanceTable title="Par stratégie" icon="psychology" rows={byStrategy} />
          <PerformanceTable title="Par paire" icon="currency_exchange" rows={byPair} />
          <PerformanceTable title="Par session" icon="schedule" rows={bySession} />
          <PerformanceTable title="Par type de clôture" icon="flag" rows={byCloseType} />
          <PerformanceTable
            title="Par état émotionnel à l'entrée"
            icon="mood"
            rows={byEmotion}
            note="La colonne la plus inconfortable du rapport, et souvent la plus instructive."
          />
        </>
      )}
    </div>
  );
}

function EquityChart({ points }: { points: ReturnType<typeof equityCurve> }) {
  if (points.length === 0) return <p className="text-subtle text-sm">Aucun trade clôturé.</p>;

  const values = points.map((point) => point.equity);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;

  const width = 100;
  const height = 32;

  const path = points
    .map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * width;
      const y = height - ((point.equity - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const zeroY = height - ((0 - min) / range) * height;
  const last = points[points.length - 1]!;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label={`Courbe de capital, ${points.length} trades clôturés, résultat final ${last.equity.toFixed(2)}`}
      >
        <line
          x1="0"
          y1={zeroY}
          x2={width}
          y2={zeroY}
          stroke="currentColor"
          strokeWidth="0.2"
          className="text-subtle"
        />
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.6"
          vectorEffect="non-scaling-stroke"
          className={last.equity >= 0 ? "text-brand-green" : "text-brand-red"}
        />
      </svg>
      <div className="text-subtle mt-1 flex justify-between font-mono text-[10px]">
        <span>{points[0]!.date}</span>
        <span>
          {points.length} trade{points.length > 1 ? "s" : ""}
        </span>
        <span>{last.date}</span>
      </div>
    </div>
  );
}

function DayChart({ days }: { days: ReturnType<typeof byWeekday> }) {
  const scale = Math.max(...days.map((day) => Math.abs(day.pnl)), 1);

  return (
    <ul className="space-y-1.5">
      {days.map((day) => (
        <li key={day.day} className="flex items-center gap-2 text-xs">
          <span className="text-muted w-8 font-mono">{day.day}</span>
          <div className="bg-panel h-2 flex-1 overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full",
                day.pnl >= 0 ? "bg-brand-green" : "bg-brand-red",
              )}
              style={{ width: `${(Math.abs(day.pnl) / scale) * 100}%` }}
            />
          </div>
          <span className="text-subtle w-10 text-right font-mono">
            {day.trades > 0 ? `${day.winRate}%` : "—"}
          </span>
          <span
            className={cn(
              "w-20 text-right font-mono font-bold",
              day.pnl > 0 ? "text-brand-green" : day.pnl < 0 ? "text-brand-red" : "text-subtle",
            )}
          >
            {day.trades === 0 ? "—" : `${day.pnl > 0 ? "+" : ""}${day.pnl.toFixed(2)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PerformanceTable({
  title,
  icon,
  rows,
  note,
}: {
  title: string;
  icon: string;
  rows: PerformanceRow[];
  note?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <Card className="overflow-x-auto">
      <CardTitle icon={icon}>{title}</CardTitle>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-subtle border-border-app border-b">
            <th className="px-2 py-1.5 text-left font-semibold">Clé</th>
            <th className="px-2 py-1.5 text-right font-semibold">Trades</th>
            <th className="px-2 py-1.5 text-right font-semibold">P&L</th>
            <th className="px-2 py-1.5 text-right font-semibold">Pips</th>
            <th className="px-2 py-1.5 text-right font-semibold">Réussite</th>
            <th className="px-2 py-1.5 text-right font-semibold">Facteur</th>
            <th className="px-2 py-1.5 text-right font-semibold">Espérance</th>
            <th className="px-2 py-1.5 text-right font-semibold">DD max</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-border-app border-b">
              <td className="text-fg px-2 py-1.5 font-medium">{row.key}</td>
              <td className="text-muted px-2 py-1.5 text-right font-mono">
                {row.closed}
                {row.trades !== row.closed ? (
                  <span className="text-subtle"> / {row.trades}</span>
                ) : null}
              </td>
              <td
                className={cn(
                  "px-2 py-1.5 text-right font-mono font-bold",
                  row.pnl > 0 ? "text-brand-green" : row.pnl < 0 ? "text-brand-red" : "text-subtle",
                )}
              >
                {row.pnl > 0 ? "+" : ""}
                {row.pnl.toFixed(2)}
              </td>
              <td className="text-muted px-2 py-1.5 text-right font-mono">
                {row.pips.toFixed(1)}
              </td>
              <td className="text-muted px-2 py-1.5 text-right font-mono">
                {row.closed === 0 ? "—" : `${row.winRate} %`}
              </td>
              <td className="text-muted px-2 py-1.5 text-right font-mono">
                {row.profitFactor === null ? "—" : row.profitFactor.toFixed(2)}
              </td>
              <td className="text-muted px-2 py-1.5 text-right font-mono">
                {row.closed === 0 ? "—" : row.expectancy.toFixed(2)}
              </td>
              <td className="text-brand-red/80 px-2 py-1.5 text-right font-mono">
                {row.maxDrawdown === 0 ? "—" : row.maxDrawdown.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note ? <p className="text-subtle mt-2 text-[11px]">{note}</p> : null}
      <p className="text-subtle mt-1 text-[11px]">
        Facteur « — » signifie aucune perte enregistrée : le ratio est indéfini, pas infini.
      </p>
    </Card>
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
