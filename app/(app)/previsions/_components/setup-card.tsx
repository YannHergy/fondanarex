"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { SavedField } from "@/app/(app)/previsions/_components/saved-field";
import { Screenshots } from "@/app/(app)/previsions/_components/screenshots";
import { removeSetup, saveSetup } from "@/app/(app)/previsions/actions";
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
          <SavedField
            label="Fondamentale I — analyse"
            value={setup.fundamentalNotes ?? ""}
            onSave={(fundamentalNotes) => saveSetup({ setupId: setup.id, fundamentalNotes })}
            multiline
            rows={3}
            placeholder="Pourquoi ce biais tient sur le fond"
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <SavedField
              label="Vents porteurs"
              value={setup.tailwinds ?? ""}
              onSave={(tailwinds) => saveSetup({ setupId: setup.id, tailwinds })}
              multiline
              rows={3}
              placeholder="Ce qui soutient le setup"
            />
            <SavedField
              label="Vents contraires"
              value={setup.headwinds ?? ""}
              onSave={(headwinds) => saveSetup({ setupId: setup.id, headwinds })}
              multiline
              rows={3}
              placeholder="Ce qui l'invaliderait"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
