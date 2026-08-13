"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { SavedField } from "@/app/(app)/previsions/_components/saved-field";
import { Screenshots } from "@/app/(app)/previsions/_components/screenshots";
import { SetupCard } from "@/app/(app)/previsions/_components/setup-card";
import { createSetup, savePlan, saveReviewNotes } from "@/app/(app)/previsions/actions";
import { Card, CardTitle } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import {
  adjacentWeekStart,  pairFundamentalBias,
  weekLabel,} from "@/domain/plan/week-plan";
import type { CurrencyWithScore } from "@/domain/types";
import type { WeekPlanRow, WeekTradeStats } from "@/lib/week-plan";
import { cn } from "@/lib/utils";

type Tab = "technique" | "review";

/**
 * Deux temps, deux onglets — le rythme réel de la semaine.
 *
 * Le plan se pose en début de semaine (le setup, sa capture, et l'analyse
 * macro qui dit ce qui doit sortir pour qu'il tienne), la revue se remplit à
 * la fin. Les onglets « Fondamental » et « Synthèse » ont été retirés : ils
 * redisaient sous une autre forme ce que l'analyse du setup produit désormais
 * directement à côté du scénario qu'elle commente.
 */
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "technique", label: "Plan de la semaine", icon: "candlestick_chart" },
  { id: "review", label: "Revue", icon: "rate_review" },
];

export function WeekPlanView({
  plan,
  currencies,  instruments,
  planWeeks,
  tradeStats,  isCurrentWeek,
}: {
  plan: WeekPlanRow;
  currencies: CurrencyWithScore[];  instruments: string[];
  planWeeks: string[];
  tradeStats: WeekTradeStats;  isCurrentWeek: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("technique");
  const [pending, startTransition] = useTransition();
  const [showHistory, setShowHistory] = useState(false);

  const label = weekLabel(plan.weekStart);

  const biases = useMemo(
    () =>
      new Map(
        plan.setups.map((setup) => [
          setup.id,
          pairFundamentalBias(setup.instrument, currencies),
        ]),
      ),
    [plan.setups, currencies],
  );

  function goToWeek(weekStart: string) {
    setShowHistory(false);
    // Navigation is a URL change, so the week is bookmarkable and the back
    // button works. The legacy version held it in component state and saved the
    // outgoing plan while loading the next one in the same tick.
    router.push(`/previsions?semaine=${weekStart}`);
  }

  function addSetup() {
    startTransition(async () => {
      await createSetup({ weekStart: plan.weekStart, instrument: instruments[0] ?? "EUR/USD" });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goToWeek(adjacentWeekStart(plan.weekStart, -1))}
              aria-label="Semaine précédente"
              className="text-subtle hover:text-fg hover:bg-panel rounded-lg p-1.5 transition-colors"
            >
              <Icon name="chevron_left" size={18} />
            </button>
            <div className="px-1 text-center">
              <p className="text-fg text-sm font-bold">{label}</p>
              {isCurrentWeek ? (
                <p className="text-brand-green text-[10px] font-semibold">semaine en cours</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => goToWeek(adjacentWeekStart(plan.weekStart, 1))}
              aria-label="Semaine suivante"
              className="text-subtle hover:text-fg hover:bg-panel rounded-lg p-1.5 transition-colors"
            >
              <Icon name="chevron_right" size={18} />
            </button>
          </div>

          <div className="relative flex items-center gap-2">
            {planWeeks.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowHistory((open) => !open)}
                className="text-subtle hover:text-fg flex items-center gap-1 text-xs"
              >
                <Icon name="history" size={14} />
                Historique
              </button>
            ) : null}

            {showHistory ? (
              <div className="bg-surface border-border-app absolute top-7 right-0 z-10 max-h-64 w-56 overflow-y-auto rounded-lg border p-1 shadow-lg">
                {planWeeks.map((week) => (
                  <button
                    key={week}
                    type="button"
                    onClick={() => goToWeek(week)}
                    className={cn(
                      "hover:bg-panel block w-full rounded px-2 py-1.5 text-left text-xs",
                      week === plan.weekStart ? "text-brand-blue font-semibold" : "text-muted",
                    )}
                  >
                    {weekLabel(week)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-border-app mt-3 flex flex-wrap gap-1 border-t pt-3">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                tab === entry.id
                  ? "bg-brand-blue text-white"
                  : "text-subtle hover:text-fg hover:bg-panel",
              )}
            >
              <Icon name={entry.icon} size={14} />
              {entry.label}
              {entry.id === "technique" && plan.setups.length > 0 ? (
                <span className="font-mono opacity-70">{plan.setups.length}</span>
              ) : null}
            </button>
          ))}
        </div>
      </Card>

      {tab === "technique" ? (
        <div className="space-y-3">
          {plan.setups.length === 0 ? (
            <Card>
              <p className="text-subtle text-sm">
                Aucun setup pour cette semaine. Ajoutez la première paire que vous comptez suivre.
              </p>
            </Card>
          ) : (
            plan.setups.map((setup) => (
              <SetupCard
                key={setup.id}
                setup={setup}
                instruments={instruments}
                fundamental={biases.get(setup.id)!}
              />
            ))
          )}

          <button
            type="button"
            onClick={addSetup}
            disabled={pending}
            className="border-border-app text-subtle hover:border-brand-blue hover:text-brand-blue flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm font-semibold transition-colors disabled:opacity-40"
          >
            <Icon name={pending ? "progress_activity" : "add"} size={16} className={pending ? "animate-spin" : undefined} />
            Ajouter un setup
          </button>
        </div>
      ) : null}


      {tab === "review" ? (
        <div className="space-y-4">
          <Card>
            <CardTitle icon="analytics">Résultat de la semaine</CardTitle>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Trades clôturés" value={String(tradeStats.count)} />
              <Stat
                label="P&L réalisé"
                value={`${tradeStats.pnl > 0 ? "+" : ""}${tradeStats.pnl.toFixed(2)}`}
                tone={tradeStats.pnl > 0 ? "green" : tradeStats.pnl < 0 ? "red" : undefined}
              />
              <Stat
                label="Taux de réussite"
                value={tradeStats.count === 0 ? "—" : `${tradeStats.winRate} %`}
              />
            </div>
            <p className="text-subtle mt-2 text-[11px]">
              Trades clôturés uniquement — mêler des positions ouvertes rendrait le taux de
              réussite ininterprétable.
            </p>
          </Card>

          {plan.setups.length === 0 ? (
            <Card>
              <p className="text-subtle text-sm">Aucun setup à revoir pour cette semaine.</p>
            </Card>
          ) : (
            plan.setups.map((setup) => (
              <Card key={setup.id}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <CurrencyBadge code={setup.instrument.split("/")[0] ?? ""} size="sm" />
                  <span className="text-fg font-mono text-sm font-bold">{setup.instrument}</span>
                  <span className="text-subtle text-xs">{setup.technicalBias}</span>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <Screenshots
                    setupId={setup.id}
                    target="review"
                    images={setup.review?.screenshots ?? []}
                    label="Captures après"
                  />
                  <SavedField
                    label="Ce qui s'est passé"
                    value={setup.review?.notes ?? ""}
                    onSave={(notes) => saveReviewNotes({ setupId: setup.id, notes })}
                    multiline
                    rows={4}
                    placeholder="Le setup s'est-il joué ? Qu'avez-vous fait, et pourquoi ?"
                  />
                </div>
              </Card>
            ))
          )}

          <Card>
            <CardTitle icon="school">Leçons de la semaine</CardTitle>
            <SavedField
              value={plan.lessons ?? ""}
              onSave={(value) => savePlan({ weekStart: plan.weekStart, lessons: value })}
              multiline
              rows={4}
              placeholder="Ce que cette semaine a appris, y compris sur les setups non pris"
            />
          </Card>

          <Card>
            <CardTitle icon="flag">Objectifs pour la semaine suivante</CardTitle>
            <SavedField
              value={plan.nextWeekObjectives ?? ""}
              onSave={(value) => savePlan({ weekStart: plan.weekStart, nextWeekObjectives: value })}
              multiline
              rows={4}
              placeholder="Concrets et vérifiables"
            />
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="border-border-app bg-panel rounded-lg border p-2.5">
      <p className="text-subtle text-[10px] font-bold tracking-widest uppercase">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-xl font-black",
          tone === "green" ? "text-brand-green" : tone === "red" ? "text-brand-red" : "text-fg",
        )}
      >
        {value}
      </p>
    </div>
  );
}
