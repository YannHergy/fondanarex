"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveMarketContext } from "@/app/(app)/admin/actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { MARKET_FIELDS } from "@/domain/market-context";
import { cn } from "@/lib/utils";

/**
 * Market-context entry — the inputs behind every `specifique: true` indicator
 * (oil, iron ore, VIX, China PMI, ZEW, KOF, ...).
 *
 * An empty field is NOT zero. It means the data is unavailable, and the engine
 * then removes that indicator's weight from the denominator instead of scoring
 * it neutral. The distinction is spelled out on screen because entering 0 for
 * "unknown" is the single easiest way to distort a currency's score.
 */
export function MarketContextEditor({
  values,
  lastUpdate,
}: {
  values: Record<string, number | null>;
  lastUpdate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);

  const filled = MARKET_FIELDS.filter((f) => values[f.key] !== null && values[f.key] !== undefined)
    .length;

  function save() {
    startTransition(async () => {
      try {
        const payload: Record<string, number | null> = {};
        for (const [key, raw] of Object.entries(edits)) {
          if (raw.trim() === "") {
            payload[key] = null;
          } else {
            const parsed = Number.parseFloat(raw);
            if (Number.isFinite(parsed)) payload[key] = parsed;
          }
        }

        if (Object.keys(payload).length === 0) {
          setStatus("Aucune modification");
          return;
        }

        const { saved } = await saveMarketContext(payload);
        setEdits({});
        setStatus(`${saved} champ(s) enregistré(s)`);
        router.refresh();
      } catch {
        setStatus("Échec de l'enregistrement");
      }
    });
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon="tune" className="mb-0">
          Contexte de marché
        </CardTitle>
        <span className="text-subtle font-mono text-[10px]">
          {filled}/{MARKET_FIELDS.length} renseignés
          {lastUpdate ? ` · maj ${lastUpdate}` : ""}
        </span>
      </div>

      <p className="text-subtle mb-4 text-[11px] leading-relaxed">
        Un champ vide signifie <strong>donnée indisponible</strong> : l&apos;indicateur est alors
        exclu du calcul et son poids sort du dénominateur. Ne saisissez pas 0 pour « inconnu » —
        cela tirerait artificiellement la devise vers le neutre.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MARKET_FIELDS.map((field) => {
          const key = field.key as string;
          const stored = values[key];
          const edited = key in edits;
          const shown = edited ? edits[key]! : (stored?.toString() ?? "");

          return (
            <div key={key}>
              <label
                htmlFor={`ctx-${key}`}
                className="text-muted mb-1 flex items-baseline gap-1.5 text-xs"
              >
                <span className="truncate">{field.label}</span>
                <span className="text-subtle shrink-0">({field.unit})</span>
              </label>
              <input
                id={`ctx-${key}`}
                type="number"
                step="0.01"
                value={shown}
                placeholder="non renseigné"
                onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                className={cn(
                  "bg-panel border-border-app text-fg focus:border-brand-blue tabular w-full rounded-lg border px-2.5 py-1.5 font-mono text-sm outline-none",
                  edited && "border-brand-blue",
                )}
              />
              <p className="text-subtle mt-0.5 text-[10px]">
                {field.devises.join(", ")} · {field.hint}
              </p>
            </div>
          );
        })}
      </div>

      <div className="border-border-app mt-4 flex items-center gap-3 border-t pt-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || Object.keys(edits).length === 0}
          className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="check" size={14} /> Enregistrer
        </button>
        {status ? (
          <span role="status" className="text-subtle text-xs">
            {status}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
