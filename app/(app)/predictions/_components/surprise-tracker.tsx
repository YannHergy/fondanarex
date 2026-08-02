"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Confidence } from "@/app/(app)/predictions/_components/confidence";
import { clearLedger } from "@/app/(app)/predictions/actions";
import { Card, CardTitle } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { byAttention, surpriseLabel, type PredictionStatus } from "@/domain/fundamental/predictions";
import type { PredictionRow, PredictionOverview } from "@/lib/fundamental";
import { cn } from "@/lib/utils";

/**
 * How badly the macro chain is behaving unlike the rules expect, per currency.
 *
 * A low score is the interesting one to act on and a high score is the warning:
 * it means the linkages the whole engine assumes are not holding right now.
 */

const STATUS_STYLE: Record<
  PredictionStatus,
  { icon: string; label: string; text: string; panel: string }
> = {
  confirmed: {
    icon: "check_circle",
    label: "Confirmée",
    text: "text-brand-green",
    panel: "border-brand-green/30 bg-brand-green/5",
  },
  contradicted: {
    icon: "cancel",
    label: "Contredite",
    text: "text-brand-red",
    panel: "border-brand-red/30 bg-brand-red/5",
  },
  pending: {
    icon: "schedule",
    label: "En attente",
    text: "text-brand-amber",
    panel: "border-brand-amber/30 bg-brand-amber/5",
  },
  expired: {
    icon: "history_toggle_off",
    label: "Expirée",
    text: "text-subtle",
    panel: "border-border-app bg-panel",
  },
};

/** Low surprise is good news, so the colour ramp runs green to red. */
function scoreTone(score: number, resolved: number): string {
  if (resolved === 0) return "text-subtle";
  if (score <= 30) return "text-brand-green";
  if (score <= 55) return "text-brand-amber";
  return "text-brand-red";
}

export function SurpriseTracker({
  surprise,
  predictions,
  totalPredictions,
}: {
  surprise: PredictionOverview["surprise"];
  predictions: PredictionRow[];
  totalPredictions: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const detail = useMemo(
    () => surprise.find((entry) => entry.currency === selected) ?? null,
    [surprise, selected],
  );

  const detailPredictions = useMemo(() => {
    if (!selected) return [];
    return predictions
      .filter((p) => p.sourceCurrency === selected || p.targetCurrency === selected)
      .sort((a, b) => byAttention(a.status, b.status) || +b.createdAt - +a.createdAt)
      .slice(0, 40);
  }, [predictions, selected]);

  function confirmClear() {
    startTransition(async () => {
      await clearLedger();
      setConfirming(false);
      setSelected(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon="bolt" className="mb-0">
          Indicateur d&apos;étonnement
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-subtle font-mono text-[10px]">
            {totalPredictions} prédiction{totalPredictions > 1 ? "s" : ""}
          </span>
          {totalPredictions > 0 ? (
            confirming ? (
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={confirmClear}
                  disabled={pending}
                  className="bg-brand-red/15 text-brand-red rounded px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
                >
                  {pending ? "Suppression…" : "Confirmer"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-subtle hover:text-fg px-2 py-1 text-[11px]"
                >
                  Annuler
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-subtle hover:text-brand-red text-[11px]"
              >
                Tout effacer
              </button>
            )
          ) : null}
        </div>
      </div>

      <p className="text-subtle -mt-1 mb-4 text-xs">
        Part des prédictions résolues qui ont été contredites, pondérée par la confiance de la
        règle. 0 % : la mécanique macro se comporte comme modélisée. 100 % : elle s&apos;inverse.
      </p>

      {totalPredictions === 0 ? (
        <p className="text-subtle py-6 text-center text-sm">
          Aucune prédiction enregistrée. Saisissez le résultat d&apos;une publication ci-dessous
          pour déclencher les règles.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {surprise.map((entry) => {
              const resolved = entry.confirmed + entry.contradicted;
              const active = selected === entry.currency;

              return (
                <button
                  key={entry.currency}
                  type="button"
                  onClick={() => setSelected(active ? null : entry.currency)}
                  className={cn(
                    "rounded-lg border p-2.5 text-left transition-colors",
                    active
                      ? "border-brand-blue bg-brand-blue/10"
                      : "border-border-app bg-panel hover:border-subtle",
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-1">
                    <CurrencyBadge code={entry.currency} size="sm" />
                    <span className={cn("text-[9px] font-bold uppercase", scoreTone(entry.score, resolved))}>
                      {resolved === 0 ? "—" : surpriseLabel(entry.level)}
                    </span>
                  </div>
                  <p className={cn("font-mono text-xl font-black", scoreTone(entry.score, resolved))}>
                    {resolved === 0 ? "·" : `${entry.score}`}
                    {resolved > 0 ? <span className="text-subtle text-xs">%</span> : null}
                  </p>
                  <div className="text-subtle mt-1 flex gap-1.5 font-mono text-[10px]">
                    <span className="text-brand-green">{entry.confirmed}</span>
                    <span className="text-brand-red">{entry.contradicted}</span>
                    <span className="text-brand-amber">{entry.pending}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {detail ? (
            <div className="border-border-app mt-4 border-t pt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-fg flex items-center gap-2 text-sm font-bold">
                  <CurrencyBadge code={detail.currency} size="sm" />
                  Détail des prédictions
                </h3>
                <div className="flex flex-wrap gap-3 font-mono text-[11px]">
                  <span className="text-brand-green">{detail.confirmed} confirmées</span>
                  <span className="text-brand-red">{detail.contradicted} contredites</span>
                  <span className="text-brand-amber">{detail.pending} en attente</span>
                  <span className="text-subtle">{detail.expired} expirées</span>
                </div>
              </div>

              {detail.confirmed + detail.contradicted === 0 ? (
                <p className="text-subtle mb-3 text-xs">
                  Aucune prédiction encore résolue pour cette devise : le score de 50 % signifie
                  &laquo; inconnu &raquo;, pas &laquo; moyennement prévisible &raquo;.
                </p>
              ) : null}

              {detailPredictions.length === 0 ? (
                <p className="text-subtle text-sm">Pas de prédiction pour cette devise.</p>
              ) : (
                <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                  {detailPredictions.map((prediction) => {
                    const style = STATUS_STYLE[prediction.status];
                    const up = prediction.predictedDirection === "bullish";

                    return (
                      <li
                        key={prediction.id}
                        className={cn("rounded-lg border p-3", style.panel)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-1.5">
                              <Icon name={style.icon} size={13} className={style.text} />
                              <span className={cn("text-xs font-bold", style.text)}>
                                {style.label}
                              </span>
                              <span className="text-subtle font-mono text-[10px]">
                                {prediction.delayLabel}
                              </span>
                            </div>
                            <p className="text-fg mb-1 text-sm font-semibold">
                              <CurrencyBadge
                                code={prediction.targetCurrency}
                                size="sm"
                                className="mr-1.5 align-middle"
                              />
                              {prediction.targetIndicatorName}
                            </p>
                            <p className="text-muted mb-1 text-xs">
                              Prédit{" "}
                              <span
                                className={cn(
                                  "font-semibold",
                                  up ? "text-brand-green" : "text-brand-red",
                                )}
                              >
                                {up ? "à la hausse" : "à la baisse"}
                              </span>
                              {prediction.resolvedDirection ? (
                                <span
                                  className={cn(
                                    "ml-2",
                                    prediction.status === "confirmed"
                                      ? "text-brand-green"
                                      : "text-brand-red",
                                  )}
                                >
                                  → réel :{" "}
                                  {prediction.resolvedDirection === "bullish"
                                    ? "hausse"
                                    : "baisse"}
                                </span>
                              ) : null}
                            </p>
                            <p className="text-subtle text-xs leading-relaxed italic">
                              {prediction.reason}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <Confidence value={prediction.confidence} />
                            <p className="text-subtle mt-1 max-w-32 text-[10px] leading-tight">
                              déclenchée par {prediction.sourceIndicatorName}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
