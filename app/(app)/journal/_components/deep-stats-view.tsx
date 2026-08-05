"use client";

import { useState, useTransition } from "react";

import { deepStatsWithAi } from "@/app/(app)/journal/actions";
import { Icon } from "@/components/ui/icon";
import { MIN_TRADES_FOR_DEEP_STATS, type DeepStats } from "@/domain/journal/deep-stats";
import type { QuantVerdict } from "@/domain/journal/quant-prompt";
import type { TradeRow } from "@/lib/journal";
import { cn } from "@/lib/utils";

/**
 * Deep statistical analysis, one measure at a time.
 *
 * Each block reads concept, then this trader's figure, then one action — the
 * order the user asked for, and the only one that works: "your SQN is 1.8"
 * cannot be acted on by someone who does not know what SQN measures.
 *
 * Locked below 30 closed trades. The lock states how many are missing rather
 * than hiding the tab, because the gate is itself information: these numbers
 * exist, they are simply not trustworthy yet.
 */
export function DeepStatsView({
  trades,
  periodLabel,
}: {
  trades: TradeRow[];
  periodLabel: string;
}) {
  const [verdict, setVerdict] = useState<QuantVerdict | null>(null);
  const [stats, setStats] = useState<DeepStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const closed = trades.filter((trade) => trade.closedAt !== null && trade.pnl !== null);
  const missing = MIN_TRADES_FOR_DEEP_STATS - closed.length;

  function run() {
    setError(null);

    startTransition(async () => {
      const result = await deepStatsWithAi({
        tradeIds: trades.map((trade) => trade.id),
        periodLabel,
      });

      if (result.ok) {
        setVerdict(result.verdict);
        setStats(result.stats);
      } else {
        setError(result.error);
        setVerdict(null);
      }
    });
  }

  if (missing > 0) {
    return (
      <div className="py-10 text-center">
        <Icon name="lock" size={28} className="text-subtle mb-3 inline-block" />
        <p className="text-fg text-sm font-semibold">
          Encore {missing} trade{missing > 1 ? "s" : ""} avant de débloquer
        </p>
        <p className="text-muted mx-auto mt-2 max-w-md text-xs leading-relaxed">
          Cette analyse demande <strong>{MIN_TRADES_FOR_DEEP_STATS} trades clôturés</strong>. En
          dessous, un ratio de Sharpe ou un Monte-Carlo ne sont pas seulement imprécis : ils
          produisent un chiffre d&apos;apparence solide qui ne décrit que du bruit.
        </p>
        <p className="text-subtle mt-2 text-[11px]">
          {closed.length} trade{closed.length > 1 ? "s" : ""} clôturé
          {closed.length > 1 ? "s" : ""} avec les filtres actuels.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-fg text-sm font-semibold">Analyse statistique approfondie</p>
          <p className="text-subtle mt-0.5 text-[11px]">
            Espérance, qualité du système, stress-test et autocorrélation. Chaque mesure est
            expliquée avant d&apos;être commentée.
          </p>
        </div>

        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40"
        >
          <Icon name={pending ? "hourglass_empty" : "function"} size={16} />
          {pending ? "Calcul et analyse…" : verdict ? "Relancer" : "Lancer l'analyse"}
        </button>
      </div>

      {error ? (
        <p className="text-brand-red flex items-start gap-1.5 text-xs">
          <Icon name="warning" size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}

      {stats ? <Numbers stats={stats} /> : null}

      {verdict ? (
        <div className="mt-5 space-y-3">
          <p className="text-fg border-brand-blue border-l-2 pl-3 text-sm leading-relaxed">
            {verdict.synthese}
          </p>

          {verdict.blocs.map((block) => (
            <div key={block.mesure} className="border-border-app bg-bg rounded-lg border p-3">
              <p className="text-brand-blue mb-1.5 text-xs font-semibold">{block.mesure}</p>

              <p className="text-subtle mb-2 text-xs leading-relaxed italic">{block.concept}</p>
              <p className="text-fg text-xs leading-relaxed">{block.lecture}</p>

              <p className="text-muted border-border-app mt-2 flex items-start gap-1.5 border-t pt-2 text-xs leading-relaxed">
                <Icon name="target" size={13} className="text-brand-green mt-0.5 shrink-0" />
                {block.conseil}
              </p>
            </div>
          ))}

          <div className="border-brand-blue bg-panel rounded-lg border p-3">
            <p className="text-brand-blue mb-1 text-[10px] font-semibold uppercase">
              Verdict sur le système
            </p>
            <p className="text-fg text-xs leading-relaxed">{verdict.verdict_systeme}</p>
          </div>

          <p className="text-subtle text-[10px]">
            Chiffres calculés par Fondanarex, sous test. Explications et conseils produits par
            Gemini à partir de ces chiffres uniquement. Le MAE et le MFE ne figurent pas ici :
            ils exigent le parcours du prix pendant chaque trade, que le rapport MetaTrader ne
            contient pas.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** The computed figures, shown before the commentary that reads them. */
function Numbers({ stats }: { stats: DeepStats }) {
  const s = stats;
  const mc = s.monteCarlo;

  const cells: { label: string; value: string; hint?: string; tone?: "green" | "red" }[] = [
    { label: "Espérance / trade", value: String(s.expectancy), tone: s.expectancy > 0 ? "green" : "red" },
    { label: "Espérance en R", value: s.expectancyR === null ? "—" : `${s.expectancyR} R` },
    {
      label: "SQN",
      value: s.sqn === null ? "—" : String(s.sqn),
      hint: s.sqn === null ? undefined : sqnBand(s.sqn),
    },
    { label: "Sharpe / trade", value: s.sharpe === null ? "—" : String(s.sharpe) },
    { label: "Sortino / trade", value: s.sortino === null ? "—" : String(s.sortino) },
    {
      label: "Efficacité de sortie",
      value: s.targetEfficiency === null ? "—" : `${s.targetEfficiency} %`,
      hint: s.targetEfficiencySample === 0 ? undefined : `sur ${s.targetEfficiencySample} gagnants`,
    },
    {
      label: "Drawdown subi",
      value: `−${s.maxDrawdown}`,
      hint: `${s.drawdownDurationTrades} trades sous le sommet`,
      tone: "red",
    },
    {
      label: "Drawdown probable",
      value: mc === null ? "—" : `−${mc.p95MaxDrawdown}`,
      hint: mc === null ? undefined : `95e centile sur ${mc.iterations} tirages`,
      tone: "red",
    },
    { label: "VaR 95 %", value: s.var95 === null ? "—" : String(s.var95), tone: "red" },
    { label: "CVaR 95 %", value: s.cvar95 === null ? "—" : String(s.cvar95), tone: "red" },
    {
      label: "Perte après perte",
      value: s.autocorrelation.lossAfterLoss === null ? "—" : `${s.autocorrelation.lossAfterLoss} %`,
      hint: `référence ${s.autocorrelation.baseLossRate} %`,
    },
    {
      label: "Gain après gain",
      value: s.autocorrelation.winAfterWin === null ? "—" : `${s.autocorrelation.winAfterWin} %`,
      hint: `référence ${s.autocorrelation.baseWinRate} %`,
    },
  ];

  return (
    <div className="border-border-app grid grid-cols-2 gap-2 border-t pt-4 sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="border-border-app bg-bg rounded-lg border p-2.5">
          <div className="text-subtle text-[10px] uppercase">{cell.label}</div>
          <div
            className={cn(
              "font-mono text-sm font-semibold",
              cell.tone === "green"
                ? "text-brand-green"
                : cell.tone === "red"
                  ? "text-brand-red"
                  : "text-fg",
            )}
          >
            {cell.value}
          </div>
          {cell.hint ? <div className="text-subtle text-[10px]">{cell.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

/** Van Tharp's own bands, so the figure arrives with its scale attached. */
function sqnBand(sqn: number): string {
  if (sqn >= 5) return "exceptionnel";
  if (sqn >= 2.5) return "bon système";
  if (sqn >= 1.5) return "correct";
  return "difficile à suivre";
}
