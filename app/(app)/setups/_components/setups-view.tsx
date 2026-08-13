"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createStrategy, deleteStrategy } from "@/app/(app)/journal/actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { MIN_TRADES_FOR_RATE, UNLABELLED, type SetupStat } from "@/domain/journal/setup-stats";
import { cn } from "@/lib/utils";

/**
 * Déclarer ses setups, et voir ce qu'ils valent.
 *
 * Deux blocs volontairement séparés : ce que le trader DIT jouer (la liste
 * qu'il déclare, qui alimente le menu du journal) et ce qu'il a RÉELLEMENT
 * joué (les statistiques, tirées du journal). L'écart entre les deux est déjà
 * une information — un setup déclaré et jamais pris, ou pris et jamais
 * déclaré, se voit d'un coup d'œil.
 */

const money = (n: number) =>
  `${n >= 0 ? "+" : ""}${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} $`;

function rateTone(rate: number | null): string {
  if (rate === null) return "text-subtle";
  if (rate >= 60) return "text-brand-green";
  if (rate >= 45) return "text-brand-amber";
  return "text-brand-red";
}

export function SetupsView({
  declared,
  known,
  stats,
  overall,
}: {
  declared: string[];
  known: string[];
  stats: SetupStat[];
  overall: SetupStat;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");

  function add() {
    const clean = name.trim();
    if (!clean) return;
    startTransition(async () => {
      await createStrategy(clean);
      setName("");
      router.refresh();
    });
  }

  function remove(setup: string) {
    startTransition(async () => {
      await deleteStrategy(setup);
      router.refresh();
    });
  }

  const declaredSet = new Set(declared);

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle icon="style">Vos setups</CardTitle>

        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add();
            }}
            placeholder="Nom du setup — « Cassure de range », « M2 »…"
            maxLength={64}
            className="bg-panel border-border-app text-fg focus:border-brand-blue min-w-56 flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none"
          />
          <button
            type="button"
            onClick={add}
            disabled={pending || name.trim().length === 0}
            className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="add" size={14} />
            Ajouter
          </button>
        </div>

        {known.length === 0 ? (
          <p className="text-muted text-sm leading-relaxed">
            Aucun setup pour l&apos;instant. Saisissez les vôtres — ce sont eux qui
            apparaîtront dans le menu au moment d&apos;enregistrer un trade, et sur lesquels
            vos statistiques seront calculées.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {known.map((setup) => {
              const isDeclared = declaredSet.has(setup);
              return (
                <span
                  key={setup}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs",
                    isDeclared
                      ? "border-brand-blue/40 bg-brand-blue/10 text-brand-blue"
                      : "border-border-app text-subtle",
                  )}
                  title={
                    isDeclared
                      ? undefined
                      : "Présent dans votre journal, mais pas déclaré — il reste proposable"
                  }
                >
                  {setup}
                  {isDeclared ? (
                    <button
                      type="button"
                      onClick={() => remove(setup)}
                      disabled={pending}
                      aria-label={`Retirer ${setup}`}
                      className="hover:text-brand-red transition-colors disabled:opacity-40"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  ) : (
                    <Icon name="history" size={11} className="opacity-60" />
                  )}
                </span>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle icon="query_stats" className="mb-0">
            Ce que disent vos trades
          </CardTitle>
          <span className="text-subtle text-[11px]">
            Un taux n&apos;apparaît qu&apos;à partir de {MIN_TRADES_FOR_RATE} trades clôturés
          </span>
        </div>

        {overall.closed === 0 ? (
          <p className="text-muted text-sm">
            Aucun trade clôturé pour l&apos;instant. Les taux apparaîtront à mesure que le
            journal se remplit.
          </p>
        ) : (
          <>
            <div className="border-border-app bg-panel mb-3 grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-4">
              <Figure label="Trades clôturés" value={String(overall.closed)} />
              <Figure
                label="Réussite globale"
                value={overall.winRatePct === null ? "—" : `${overall.winRatePct} %`}
                tone={rateTone(overall.winRatePct)}
              />
              <Figure
                label="P&L net"
                value={money(overall.netPnl)}
                tone={overall.netPnl >= 0 ? "text-brand-green" : "text-brand-red"}
              />
              <Figure
                label="Gain moyen"
                value={overall.expectancy === null ? "—" : money(overall.expectancy)}
                tone={
                  (overall.expectancy ?? 0) >= 0 ? "text-brand-green" : "text-brand-red"
                }
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-subtle border-border-app border-b">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">Setup</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Clôturés</th>
                    <th className="px-2 py-1.5 text-right font-semibold">G / P / N</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Réussite</th>
                    <th className="px-2 py-1.5 text-right font-semibold">P&amp;L</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Gain moyen</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((stat) => (
                    <tr key={stat.setup} className="border-border-app border-b last:border-0">
                      <td className="px-2 py-1.5">
                        <span
                          className={cn(
                            "font-medium",
                            stat.setup === UNLABELLED ? "text-subtle italic" : "text-fg",
                          )}
                        >
                          {stat.setup}
                        </span>
                      </td>
                      <td className="tabular px-2 py-1.5 text-right font-mono">{stat.closed}</td>
                      <td className="tabular text-subtle px-2 py-1.5 text-right font-mono">
                        {stat.wins} / {stat.losses} / {stat.breakeven}
                      </td>
                      <td
                        className={cn(
                          "tabular px-2 py-1.5 text-right font-mono font-semibold",
                          rateTone(stat.winRatePct),
                        )}
                        title={
                          stat.reliable
                            ? undefined
                            : `Pas assez de données — ${stat.closed}/${MIN_TRADES_FOR_RATE} trades clôturés`
                        }
                      >
                        {stat.winRatePct === null ? "—" : `${stat.winRatePct} %`}
                      </td>
                      <td
                        className={cn(
                          "tabular px-2 py-1.5 text-right font-mono",
                          stat.netPnl >= 0 ? "text-brand-green" : "text-brand-red",
                        )}
                      >
                        {money(stat.netPnl)}
                      </td>
                      <td className="tabular text-muted px-2 py-1.5 text-right font-mono">
                        {stat.expectancy === null ? "—" : money(stat.expectancy)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-subtle font-mono text-[10px] tracking-wide uppercase">{label}</p>
      <p className={cn("tabular mt-0.5 font-mono text-lg font-bold", tone ?? "text-fg")}>
        {value}
      </p>
    </div>
  );
}
