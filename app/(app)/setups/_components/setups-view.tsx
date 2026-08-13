"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createStrategy, deleteStrategy } from "@/app/(app)/journal/actions";
import { reviewSetupsAction } from "@/app/(app)/setups/actions";
import type { SetupReviewResult } from "@/lib/setup-review";
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
  const [review, setReview] = useState<SetupReviewResult | null>(null);
  const [reviewing, setReviewing] = useState(false);

  async function runReview() {
    setReviewing(true);
    setReview(null);
    try {
      setReview(await reviewSetupsAction());
    } catch {
      setReview({ ok: false, message: "L analyse a échoué." });
    } finally {
      setReviewing(false);
    }
  }

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

      {/* La revue vient APRÈS le tableau : le trader voit d'abord ses propres
          chiffres, l'avis du modèle commente ce qu'il a déjà sous les yeux
          plutôt que de se substituer à sa lecture. */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CardTitle icon="psychology" className="mb-0">
            Quelle méthode garder ?
          </CardTitle>
          <button
            type="button"
            onClick={() => void runReview()}
            disabled={reviewing || overall.closed === 0}
            title={overall.closed === 0 ? "Aucun trade clôturé à analyser" : undefined}
            className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon
              name={reviewing ? "progress_activity" : "auto_awesome"}
              size={13}
              className={reviewing ? "animate-spin" : undefined}
            />
            {reviewing ? "Analyse…" : "Analyser mes setups"}
          </button>
        </div>

        {review ? (
          <SetupReview review={review} />
        ) : (
          <p className="text-muted text-sm leading-relaxed">
            L&apos;analyse ne lit que vos chiffres réels : nombre de trades, gagnants,
            perdants, gain et perte moyens. Elle raisonne sur l&apos;espérance, pas sur le seul
            taux de réussite — un setup à 30 % qui gagne gros vaut mieux qu&apos;un setup à
            70 % qui gagne peu et perd beaucoup.
          </p>
        )}
      </Card>
    </div>
  );
}

const VERDICT_STYLE: Record<string, { label: string; icon: string; className: string }> = {
  garder: {
    label: "Garder",
    icon: "check_circle",
    className: "border-brand-green/30 bg-brand-green/5 text-brand-green",
  },
  réduire: {
    label: "Réduire",
    icon: "trending_down",
    className: "border-brand-amber/30 bg-brand-amber/5 text-brand-amber",
  },
  abandonner: {
    label: "Abandonner",
    icon: "cancel",
    className: "border-brand-red/30 bg-brand-red/5 text-brand-red",
  },
  poursuivre_mesure: {
    label: "Continuer à mesurer",
    icon: "hourglass_empty",
    className: "border-brand-blue/30 bg-brand-blue/5 text-brand-blue",
  },
};

/**
 * La revue du modèle, un verdict par setup.
 *
 * Le verdict « continuer à mesurer » est traité comme les autres, pas comme
 * une absence de réponse : sur un échantillon trop court, « je ne sais pas
 * encore » EST la bonne conclusion, et l'afficher évite qu'un trader abandonne
 * un setup sur trois trades.
 */
function SetupReview({ review }: { review: SetupReviewResult }) {
  if (!review.ok) {
    return <p className="text-brand-red text-xs">{review.message}</p>;
  }

  return (
    <div className="space-y-3">
      {review.synthese ? (
        <p className="text-muted text-sm leading-relaxed">{review.synthese}</p>
      ) : null}

      <div className="space-y-1.5">
        {(review.verdicts ?? []).map((verdict) => {
          const style = VERDICT_STYLE[verdict.verdict] ?? {
            label: verdict.verdict,
            icon: "help",
            className: "border-border-app text-muted",
          };
          return (
            <div
              key={verdict.setup}
              className={cn("rounded-lg border p-2.5", style.className)}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase">
                  <Icon name={style.icon} size={11} />
                  {style.label}
                </span>
                <span className="text-fg font-mono text-[11px] font-semibold">
                  {verdict.setup}
                </span>
              </div>
              <p className="text-muted text-xs leading-relaxed">{verdict.reason}</p>
            </div>
          );
        })}
      </div>

      <p className="text-subtle text-[11px]">{review.message}</p>
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
