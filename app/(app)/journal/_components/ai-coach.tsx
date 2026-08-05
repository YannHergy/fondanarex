"use client";

import { useState, useTransition } from "react";

import { analyseJournalWithAi } from "@/app/(app)/journal/actions";
import { Icon } from "@/components/ui/icon";
import type { JournalAnalytics } from "@/domain/journal/analytics";
import type { CoachVerdict } from "@/domain/journal/coach-prompt";
import type { TradeRow } from "@/lib/journal";
import { cn } from "@/lib/utils";

/**
 * Behavioural reading of the journal.
 *
 * The panel shows the COMPUTED figures first and the model's commentary
 * underneath, in that order and visibly separated. The point is that the reader
 * can always check the interpretation against the numbers it came from — if the
 * two ever disagree, the numbers win, and the layout says so.
 *
 * Nothing is requested automatically: an analysis costs a call and says the
 * same thing twice in a row on an unchanged journal.
 */
export function AiCoach({ trades, periodLabel }: { trades: TradeRow[]; periodLabel: string }) {
  const [verdict, setVerdict] = useState<CoachVerdict | null>(null);
  const [analytics, setAnalytics] = useState<JournalAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const closed = trades.filter((trade) => trade.closedAt !== null && trade.pnl !== null);

  function run() {
    setError(null);

    startTransition(async () => {
      const result = await analyseJournalWithAi({
        tradeIds: trades.map((trade) => trade.id),
        periodLabel,
      });

      if (result.ok) {
        setVerdict(result.verdict);
        setAnalytics(result.analytics);
      } else {
        setError(result.error);
        setVerdict(null);
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-fg text-sm font-semibold">Lecture comportementale</p>
          <p className="text-subtle mt-0.5 text-[11px]">
            Les chiffres sont calculés ici, sous test. Le modèle les interprète — il n&apos;en
            calcule aucun.
          </p>
        </div>

        <button
          type="button"
          onClick={run}
          disabled={pending || closed.length < 5}
          className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40"
        >
          <Icon name={pending ? "hourglass_empty" : "psychology"} size={16} />
          {pending ? "Analyse en cours…" : verdict ? "Relancer l'analyse" : "Analyser"}
        </button>
      </div>

      {closed.length < 5 ? (
        <p className="text-subtle py-8 text-center text-sm">
          Il faut au moins 5 trades clôturés pour une analyse qui tienne debout.
          <br />
          <span className="text-[11px]">
            {closed.length} pour l&apos;instant avec les filtres actuels.
          </span>
        </p>
      ) : null}

      {error ? (
        <p className="text-brand-red flex items-start gap-1.5 text-xs">
          <Icon name="warning" size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}

      {analytics ? <Facts analytics={analytics} /> : null}

      {verdict ? (
        <div className="mt-5 space-y-3">
          <p className="text-fg border-brand-blue border-l-2 pl-3 text-sm leading-relaxed">
            {verdict.synthese}
          </p>

          {verdict.sections.map((section) => (
            <div key={section.titre} className="border-border-app bg-bg rounded-lg border p-3">
              <p className="text-fg mb-1 text-xs font-semibold">{section.titre}</p>
              <p className="text-muted text-xs leading-relaxed">{section.constat}</p>
              <p className="text-subtle mt-1.5 text-xs leading-relaxed">{section.consequence}</p>
            </div>
          ))}

          <div className="grid gap-2 sm:grid-cols-3">
            <Verdict icon="trending_up" tone="green" label="Force" text={verdict.force_principale} />
            <Verdict icon="warning" tone="red" label="Risque" text={verdict.risque_principal} />
            <Verdict
              icon="target"
              tone="blue"
              label="À changer en priorité"
              text={verdict.action_prioritaire}
            />
          </div>

          <p className="text-subtle text-[10px]">
            Interprétation produite par Gemini à partir des chiffres ci-dessus. Elle ne connaît
            ni ta stratégie, ni ton état d&apos;esprit, ni le contexte de marché — seulement les
            traces laissées par tes trades.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** The computed figures, shown before the commentary rather than after. */
function Facts({ analytics }: { analytics: JournalAnalytics }) {
  const a = analytics;

  const cells: { label: string; value: string; hint?: string }[] = [
    { label: "Réussite", value: `${a.winRate} %`, hint: `${a.wins}V / ${a.losses}D` },
    {
      label: "Gain / perte moyens",
      value: a.payoffRatio === null ? "—" : `${a.payoffRatio}×`,
      hint: `${a.averageWin} contre ${a.averageLoss}`,
    },
    { label: "Pire série", value: `${a.maxConsecutiveLosses} pertes` },
    { label: "Trades avec stop", value: `${a.stopLossCoverage} %` },
    {
      label: "Résultat médian",
      value: a.medianRMultiple === null ? "—" : `${a.medianRMultiple} R`,
      hint: "en multiples du risque prévu",
    },
    {
      label: "Lots après perte",
      value: a.lotAfterLoss === null ? "—" : String(a.lotAfterLoss),
      hint: a.lotAfterWin === null ? undefined : `${a.lotAfterWin} après un gain`,
    },
    {
      label: "Reprise après perte",
      value: duration(a.reentryMinutesAfterLoss),
      hint:
        a.reentryMinutesAfterWin === null
          ? undefined
          : `${duration(a.reentryMinutesAfterWin)} après un gain`,
    },
    {
      label: "Durée des perdants",
      value: duration(a.holdMinutesOnLoss),
      hint:
        a.holdMinutesOnWin === null ? undefined : `${duration(a.holdMinutesOnWin)} pour les gagnants`,
    },
  ];

  return (
    <div className="border-border-app grid grid-cols-2 gap-2 border-t pt-4 sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="border-border-app bg-bg rounded-lg border p-2.5">
          <div className="text-subtle text-[10px] uppercase">{cell.label}</div>
          <div className="text-fg font-mono text-sm font-semibold">{cell.value}</div>
          {cell.hint ? <div className="text-subtle text-[10px]">{cell.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

function duration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 90) return `${Math.round(minutes)} min`;
  if (minutes < 2880) return `${(minutes / 60).toFixed(1)} h`;
  return `${(minutes / 1440).toFixed(1)} j`;
}

function Verdict({
  icon,
  tone,
  label,
  text,
}: {
  icon: string;
  tone: "green" | "red" | "blue";
  label: string;
  text: string;
}) {
  return (
    <div className="border-border-app bg-bg rounded-lg border p-3">
      <div
        className={cn(
          "mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase",
          tone === "green"
            ? "text-brand-green"
            : tone === "red"
              ? "text-brand-red"
              : "text-brand-blue",
        )}
      >
        <Icon name={icon} size={13} />
        {label}
      </div>
      <p className="text-muted text-xs leading-relaxed">{text}</p>
    </div>
  );
}
