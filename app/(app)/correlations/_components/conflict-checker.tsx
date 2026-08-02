"use client";

import { useMemo, useState } from "react";

import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { CORR_PAIRS } from "@/domain/data/correlations";
import {
  adjustedRiskPct,
  analyzeConflicts,
  maxEffectiveCorrelation,
  type ConflictLevel,
  type PlannedTrade,
} from "@/domain/signals/conflicts";
import { cn } from "@/lib/utils";

const LEVEL_META: Record<ConflictLevel, { label: string; className: string; icon: string }> = {
  CONFLIT: {
    label: "Conflit",
    className: "text-brand-red border-brand-red/30 bg-brand-red/10",
    icon: "warning",
  },
  DOUBLE: {
    label: "Double exposition",
    className: "text-brand-amber border-brand-amber/30 bg-brand-amber/10",
    icon: "error",
  },
  NEUTRALISE: {
    label: "Neutralisé",
    className: "text-brand-blue border-brand-blue/30 bg-brand-blue/10",
    icon: "info",
  },
  OK: {
    label: "OK",
    className: "text-brand-green border-brand-green/30 bg-brand-green/10",
    icon: "check_circle",
  },
};

/**
 * Planned-trade conflict checker.
 *
 * Deliberately client-only and not persisted: this is a scratchpad for
 * "should I take these three trades together?", answered before anything is
 * committed. The legacy version behaved the same way.
 */
export function ConflictChecker({ defaultRiskPct }: { defaultRiskPct: number }) {
  const [trades, setTrades] = useState<PlannedTrade[]>([]);
  const [pair, setPair] = useState(CORR_PAIRS[0] ?? "EUR/USD");
  const [direction, setDirection] = useState<"buy" | "sell">("buy");

  const conflicts = useMemo(() => analyzeConflicts(trades), [trades]);
  const maxCorr = useMemo(() => maxEffectiveCorrelation(conflicts), [conflicts]);
  const suggested = adjustedRiskPct(maxCorr);

  function add() {
    setTrades((prev) => [
      ...prev,
      { id: `${pair}-${direction}-${Date.now()}`, pair, direction },
    ]);
  }

  return (
    <Card>
      <CardTitle icon="rule">Vérificateur de conflits</CardTitle>
      <p className="text-subtle mb-3 text-[11px] leading-relaxed">
        Deux paires corrélées prises dans le même sens ne font pas deux trades : elles font un seul
        trade en taille double. Le sens compte autant que la corrélation — les mêmes paires en sens
        opposés se neutralisent.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="cc-pair" className="text-muted mb-1 block text-xs">
            Paire
          </label>
          <select
            id="cc-pair"
            value={pair}
            onChange={(e) => setPair(e.target.value)}
            className="bg-panel border-border-app text-fg rounded-lg border px-2.5 py-1.5 text-sm outline-none"
          >
            {CORR_PAIRS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cc-dir" className="text-muted mb-1 block text-xs">
            Sens
          </label>
          <select
            id="cc-dir"
            value={direction}
            onChange={(e) => setDirection(e.target.value as "buy" | "sell")}
            className="bg-panel border-border-app text-fg rounded-lg border px-2.5 py-1.5 text-sm outline-none"
          >
            <option value="buy">Achat</option>
            <option value="sell">Vente</option>
          </select>
        </div>

        <button
          type="button"
          onClick={add}
          className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors"
        >
          <Icon name="add" size={14} /> Ajouter
        </button>

        {trades.length > 0 ? (
          <button
            type="button"
            onClick={() => setTrades([])}
            className="border-border-app text-muted hover:text-brand-red flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors"
          >
            <Icon name="delete_sweep" size={14} /> Vider
          </button>
        ) : null}
      </div>

      {trades.length === 0 ? (
        <p className="text-subtle text-sm">
          Ajoutez au moins deux trades envisagés pour analyser leurs interactions.
        </p>
      ) : (
        <>
          <ul className="mb-4 flex flex-wrap gap-2">
            {trades.map((t) => (
              <li
                key={t.id}
                className="border-border-app bg-panel flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
              >
                <span className="text-fg font-mono text-xs font-semibold">{t.pair}</span>
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase",
                    t.direction === "buy" ? "text-brand-green" : "text-brand-red",
                  )}
                >
                  {t.direction === "buy" ? "Achat" : "Vente"}
                </span>
                <button
                  type="button"
                  onClick={() => setTrades((prev) => prev.filter((x) => x.id !== t.id))}
                  aria-label={`Retirer ${t.pair}`}
                  className="text-subtle hover:text-brand-red"
                >
                  <Icon name="close" size={13} />
                </button>
              </li>
            ))}
          </ul>

          {conflicts.length > 0 ? (
            <>
              <ul className="space-y-2">
                {conflicts.map((conflict) => {
                  const meta = LEVEL_META[conflict.level];
                  return (
                    <li
                      key={`${conflict.a.id}-${conflict.b.id}`}
                      className={cn("rounded-lg border p-2.5", meta.className)}
                    >
                      <div className="flex items-center gap-2">
                        <Icon name={meta.icon} size={14} />
                        <span className="text-[10px] font-bold tracking-wide uppercase">
                          {meta.label}
                        </span>
                        <span className="text-muted font-mono text-xs">
                          {conflict.a.pair} × {conflict.b.pair}
                        </span>
                      </div>
                      <p className="text-muted mt-1 text-xs leading-relaxed">{conflict.message}</p>
                    </li>
                  );
                })}
              </ul>

              <div className="border-border-app mt-4 flex flex-wrap items-center gap-4 border-t pt-3">
                <div>
                  <p className="text-subtle font-mono text-[10px] tracking-widest uppercase">
                    Risque suggéré
                  </p>
                  <p
                    className={cn(
                      "tabular font-mono text-xl font-bold",
                      suggested === 0
                        ? "text-brand-red"
                        : suggested < defaultRiskPct
                          ? "text-brand-amber"
                          : "text-brand-green",
                    )}
                  >
                    {suggested} %
                  </p>
                </div>
                <p className="text-subtle max-w-md text-[11px] leading-relaxed">
                  {suggested === 0
                    ? "Corrélation trop forte : ces positions sont le même trade. Gardez-en une seule plutôt que de réduire les deux."
                    : `Contre ${defaultRiskPct} % par défaut, ajusté pour une corrélation effective maximale de ${maxCorr} %.`}
                </p>
              </div>
            </>
          ) : null}
        </>
      )}
    </Card>
  );
}
