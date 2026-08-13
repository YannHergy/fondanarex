"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { SavedField } from "@/app/(app)/previsions/_components/saved-field";
import { MacroConditions } from "@/app/(app)/previsions/_components/macro-conditions";
import { Screenshots } from "@/app/(app)/previsions/_components/screenshots";
import { analyseSetupAction, removeSetup, saveSetup } from "@/app/(app)/previsions/actions";
import { Icon } from "@/components/ui/icon";
import { isConflicted, type PairBias, type TechnicalBias } from "@/domain/plan/week-plan";
import type { SetupRow } from "@/lib/week-plan";
import { cn } from "@/lib/utils";

const BIAS_STYLE: Record<TechnicalBias, string> = {
  Bullish: "border-brand-green/40 bg-brand-green/10 text-brand-green",
  Bearish: "border-brand-red/40 bg-brand-red/10 text-brand-red",
  Neutral: "border-brand-amber/40 bg-brand-amber/10 text-brand-amber",
};

const BIAS_ICON: Record<TechnicalBias, string> = {
  Bullish: "trending_up",
  Bearish: "trending_down",
  Neutral: "trending_flat",
};

export function SetupCard({
  setup,
  instruments,
  fundamental,
}: {
  setup: SetupRow;
  instruments: string[];
  fundamental: PairBias;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [horizon, setHorizon] = useState(setup.horizonDays ?? 7);
  const [analysing, setAnalysing] = useState(false);
  const [analysis, setAnalysis] = useState<{ ok: boolean; message: string } | null>(null);

  async function runAnalysis() {
    setAnalysis(null);
    setAnalysing(true);
    try {
      setAnalysis(await analyseSetupAction({ setupId: setup.id, horizonDays: horizon }));
      router.refresh();
    } catch {
      setAnalysis({ ok: false, message: "L'analyse a échoué." });
    } finally {
      setAnalysing(false);
    }
  }

  function patch(fields: Parameters<typeof saveSetup>[0]) {
    startTransition(async () => {
      await saveSetup(fields);
      router.refresh();
    });
  }

  const conflicted = isConflicted(setup.technicalBias, fundamental.bias);

  return (
    <div className="border-border-app bg-surface rounded-xl border p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Paire"
          value={setup.instrument}
          onChange={(event) => patch({ setupId: setup.id, instrument: event.target.value })}
          className="bg-panel border-border-app text-fg focus:border-brand-blue rounded-lg border px-2.5 py-1.5 font-mono text-sm font-bold focus:outline-none"
        >
          {instruments.map((symbol) => (
            <option key={symbol} value={symbol}>
              {symbol}
            </option>
          ))}
        </select>

        <div className="flex gap-1">
          {(["Bullish", "Neutral", "Bearish"] as const).map((bias) => (
            <button
              key={bias}
              type="button"
              onClick={() => patch({ setupId: setup.id, technicalBias: bias })}
              disabled={pending}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors disabled:opacity-50",
                setup.technicalBias === bias
                  ? BIAS_STYLE[bias]
                  : "border-border-app text-subtle hover:text-fg",
              )}
            >
              <Icon name={BIAS_ICON[bias]} size={12} />
              {bias}
            </button>
          ))}
        </div>

        {/* The fundamental read sits next to the technical one so a
         * disagreement is visible at the moment the setup is written down. */}
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px]",
            conflicted ? "bg-brand-amber/10 text-brand-amber" : "text-subtle",
          )}
          title={
            conflicted
              ? "Le biais technique contredit le score fondamental"
              : "Score fondamental des deux devises"
          }
        >
          {conflicted ? <Icon name="warning" size={12} /> : null}
          <span className="font-mono">
            {fundamental.base} {fundamental.baseScore} · {fundamental.quote}{" "}
            {fundamental.quoteScore}
          </span>
          <span className="font-semibold">{fundamental.bias}</span>
        </span>

        <span className="ml-auto flex items-center gap-1">
          {confirming ? (
            <>
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await removeSetup(setup.id);
                    router.refresh();
                  })
                }
                disabled={pending}
                className="bg-brand-red/15 text-brand-red rounded px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
              >
                Supprimer
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-subtle hover:text-fg px-1.5 text-[11px]"
              >
                Annuler
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              title="Supprimer ce setup"
              className="text-subtle hover:text-brand-red"
            >
              <Icon name="delete" size={16} />
            </button>
          )}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <SavedField
              label="Zone d'entrée"
              value={setup.entryZone ?? ""}
              onSave={(entryZone) => saveSetup({ setupId: setup.id, entryZone })}
            />
            <SavedField
              label="TP"
              value={setup.tp ?? ""}
              onSave={(tp) => saveSetup({ setupId: setup.id, tp })}
            />
            <SavedField
              label="SL"
              value={setup.sl ?? ""}
              onSave={(sl) => saveSetup({ setupId: setup.id, sl })}
            />
          </div>

          <SavedField
            label="Notes techniques"
            value={setup.notes ?? ""}
            onSave={(notes) => saveSetup({ setupId: setup.id, notes })}
            multiline
            rows={3}
            placeholder="Structure, niveaux, invalidation…"
          />

          <Screenshots
            setupId={setup.id}
            target="setup"
            images={setup.screenshots}
            label="Captures avant"
          />
        </div>

        <div className="space-y-3">
          {/* L'horizon est une INTENTION du trader, pas une donnée dérivable :
              c'est lui qui décide sur combien de jours son scénario vit, et
              c'est ce qui borne les publications à confronter. */}
          <div className="border-border-app flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <span className="text-subtle font-mono text-[10px] tracking-wide uppercase">
              Le scénario couvre
            </span>
            <select
              value={horizon}
              onChange={(event) => setHorizon(Number(event.target.value))}
              className="bg-panel border-border-app text-fg focus:border-brand-blue rounded border px-2 py-1 text-xs focus:outline-none"
            >
              {[3, 7, 14, 21, 30].map((days) => (
                <option key={days} value={days}>
                  {days} jours
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={runAnalysis}
              disabled={analysing}
              className="bg-brand-blue hover:bg-brand-blue/90 ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon
                name={analysing ? "progress_activity" : "auto_awesome"}
                size={12}
                className={analysing ? "animate-spin" : undefined}
              />
              {analysing ? "Analyse…" : "Analyser la capture"}
            </button>
          </div>

          {analysis ? (
            <p
              role="status"
              className={cn(
                "text-[11px] leading-relaxed",
                analysis.ok ? "text-brand-green" : "text-brand-red",
              )}
            >
              {analysis.message}
            </p>
          ) : null}

          {setup.macroBias ? (
            <div className="flex items-center gap-2">
              <span className="text-subtle font-mono text-[10px] tracking-wide uppercase">
                Biais macro de la semaine
              </span>
              <span
                className={cn(
                  "rounded-lg border px-2 py-0.5 text-[11px] font-bold",
                  setup.macroBias === "Haussier"
                    ? BIAS_STYLE.Bullish
                    : setup.macroBias === "Baissier"
                      ? BIAS_STYLE.Bearish
                      : BIAS_STYLE.Neutral,
                )}
              >
                {setup.macroBias}
              </span>
            </div>
          ) : null}

          <SavedField
            label="Fondamentale — analyse"
            value={setup.fundamentalNotes ?? ""}
            onSave={(fundamentalNotes) => saveSetup({ setupId: setup.id, fundamentalNotes })}
            multiline
            rows={3}
            placeholder="Lancez l'analyse, ou écrivez pourquoi ce biais tient sur le fond"
          />

          {/* Les deux issues possibles, côte à côte. Le scénario qui valide et
              celui qui casse se lisent ensemble : voir seulement le premier
              donne un plan sans porte de sortie. */}
          {setup.tailwinds || setup.headwinds ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Scenario
                tone="favorable"
                title="Scénario qui corrobore"
                text={setup.tailwinds}
              />
              <Scenario
                tone="contraire"
                title="Scénario qui contredit"
                text={setup.headwinds}
              />
            </div>
          ) : null}

          {/* Ce que les données doivent faire, une bande par publication. */}
          <div>
            <p className="text-subtle mb-1.5 font-mono text-[10px] tracking-wide uppercase">
              Ce qui doit se passer
            </p>
            <MacroConditions conditions={setup.macroConditions ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Une des deux issues du setup.
 *
 * Encadré coloré plutôt que simple texte : le trader doit voir en un coup
 * d'œil lequel des deux blocs il est en train de lire. La couleur ne dit rien
 * seule — le titre et l'icône portent la même information.
 */
function Scenario({
  tone,
  title,
  text,
}: {
  tone: "favorable" | "contraire";
  title: string;
  text: string | null;
}) {
  const favorable = tone === "favorable";
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border",
        favorable
          ? "border-brand-green/30 bg-brand-green/5"
          : "border-brand-red/30 bg-brand-red/5",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase",
          favorable ? "text-brand-green" : "text-brand-red",
        )}
      >
        <Icon name={favorable ? "check_circle" : "cancel"} size={12} />
        {title}
      </div>
      <p className="text-muted max-h-48 overflow-y-auto px-2.5 pb-2.5 text-xs leading-relaxed">
        {text?.trim() || "—"}
      </p>
    </div>
  );
}
