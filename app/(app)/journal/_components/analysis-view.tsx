"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  BreakdownBars,
  EvolutionChart,
  MonteCarloCone,
  ResultsHistogram,
} from "@/app/(app)/journal/_components/analysis-charts";
import { analyseJournalWithAi, removeAnalysisRun } from "@/app/(app)/journal/actions";
import { Icon } from "@/components/ui/icon";
import type { AnalysisVerdict } from "@/domain/journal/analysis-prompt";
import type { JournalAnalytics } from "@/domain/journal/analytics";
import {
  MIN_TRADES_FOR_DEEP_STATS,
  RELIABLE_SAMPLE_SIZE,
  type DeepStats,
} from "@/domain/journal/deep-stats";
import { GRADERS, type Grade, type GradedMetric } from "@/domain/journal/grading";
import type { AnalysisRunRow } from "@/lib/analysis-history";
import type { TradeRow } from "@/lib/journal";
import { cn } from "@/lib/utils";

/**
 * The journal's single analysis view.
 *
 * Numbers first, as wide colour-graded bands, then one AI pass that explains
 * each measure and reads the behaviour. Merged from two tabs at the user's
 * request, and it is the better shape: the statements worth reading sit ACROSS
 * the two sets, and a split forced the reader to hold one half in their head.
 *
 * The colour comes from `GRADERS`, never from the model. A colour is a claim,
 * and a claim that shifted between two runs of the same journal would be worse
 * than no colour at all.
 */
export function AnalysisView({
  trades,
  periodLabel,
  history,
}: {
  trades: TradeRow[];
  periodLabel: string;
  /** Saved runs, newest first. Fed by the server so a reload keeps them. */
  history: AnalysisRunRow[];
}) {
  const router = useRouter();
  const [verdict, setVerdict] = useState<AnalysisVerdict | null>(null);
  const [analytics, setAnalytics] = useState<JournalAnalytics | null>(null);
  const [stats, setStats] = useState<DeepStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const closed = trades.filter((trade) => trade.closedAt !== null && trade.pnl !== null);
  const missing = MIN_TRADES_FOR_DEEP_STATS - closed.length;

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
        setStats(result.stats);
        // Pulls the freshly saved run into the history without a manual reload.
        router.refresh();
      } else {
        setError(result.error);
        setVerdict(null);
      }
    });
  }

  if (missing > 0) {
    return (
      <div className="py-12 text-center">
        <Icon name="lock" size={30} className="text-subtle mb-3 inline-block" />
        <p className="text-fg text-base font-semibold">
          Encore {missing} trade{missing > 1 ? "s" : ""} avant de débloquer
        </p>
        <p className="text-muted mx-auto mt-2 max-w-lg text-sm leading-relaxed">
          L&apos;analyse demande <strong>{MIN_TRADES_FOR_DEEP_STATS} trades clôturés</strong> au
          minimum, et ne devient vraiment fiable qu&apos;à partir de {RELIABLE_SAMPLE_SIZE}. En
          dessous, un ratio de Sharpe ou un Monte-Carlo produisent un chiffre d&apos;apparence
          solide qui ne décrit que du bruit.
        </p>
        <p className="text-subtle mt-2 text-xs">
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
          <p className="text-fg text-base font-semibold">Analyse du journal</p>
          <p className="text-subtle mt-0.5 text-xs">
            Les chiffres sont calculés ici, sous test, et notés selon des seuils fixes. Le modèle
            les explique et lit ton comportement — il n&apos;en calcule aucun.
          </p>
        </div>

        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-40"
        >
          <Icon name={pending ? "hourglass_empty" : "psychology"} size={17} />
          {pending ? "Analyse en cours…" : verdict ? "Relancer l'analyse" : "Analyser"}
        </button>
      </div>

      {closed.length < RELIABLE_SAMPLE_SIZE ? (
        <div className="border-brand-amber/40 bg-brand-amber/10 mb-4 flex items-start gap-2 rounded-lg border p-3">
          <Icon name="info" size={15} className="text-brand-amber mt-0.5 shrink-0" />
          <p className="text-muted text-xs leading-relaxed">
            <strong className="text-brand-amber">Échantillon de {closed.length} trades.</strong> Ces
            mesures ne deviennent fiables qu&apos;à partir de {RELIABLE_SAMPLE_SIZE}. Lis-les comme
            des tendances, pas comme des conclusions.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="text-brand-red flex items-start gap-1.5 text-sm">
          <Icon name="warning" size={15} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}

      {analytics && stats ? (
        <>
          <Bands analytics={analytics} stats={stats} />

          <div className="mt-4 space-y-3">
            <MonteCarloCone stats={stats} />
            <ResultsHistogram stats={stats} />
            <BreakdownBars
              title="Résultat par paire"
              subtitle="Ce qui rapporte et ce qui coûte, sans avoir à comparer huit nombres de tête."
              rows={analytics.byInstrument}
            />
            <BreakdownBars
              title="Résultat par jour de la semaine"
              subtitle="Les jours où ton exécution tient, et ceux où elle lâche."
              rows={analytics.byWeekday}
            />
            <BreakdownBars
              title="Résultat par heure d'ouverture"
              subtitle="Horloge du serveur de ton courtier, telle que MetaTrader l'écrit — pas UTC."
              rows={analytics.byServerHour}
            />
          </div>
        </>
      ) : null}

      {history.length > 0 ? (
        <div className="mt-4 space-y-3">
          <EvolutionChart runs={history} />
          <History runs={history} />
        </div>
      ) : null}

      {verdict ? (
        <div className="mt-6 space-y-4">
          <p className="text-fg border-brand-blue border-l-2 pl-4 text-sm leading-relaxed">
            {verdict.synthese}
          </p>

          <Section title="Les mesures, expliquées" icon="function">
            {verdict.mesures.map((block) => (
              <div key={block.mesure} className="border-border-app bg-bg rounded-lg border p-4">
                <p className="text-brand-blue mb-2 text-sm font-semibold">{block.mesure}</p>
                <p className="text-subtle mb-2.5 text-sm leading-relaxed italic">{block.concept}</p>
                <p className="text-fg text-sm leading-relaxed">{block.lecture}</p>
                <p className="text-muted border-border-app mt-2.5 flex items-start gap-2 border-t pt-2.5 text-sm leading-relaxed">
                  <Icon name="target" size={15} className="text-brand-green mt-0.5 shrink-0" />
                  {block.conseil}
                </p>
              </div>
            ))}
          </Section>

          <Section title="Ton comportement" icon="psychology">
            {verdict.comportement.map((block) => (
              <div key={block.titre} className="border-border-app bg-bg rounded-lg border p-4">
                <p className="text-fg mb-1.5 text-sm font-semibold">{block.titre}</p>
                <p className="text-muted text-sm leading-relaxed">{block.constat}</p>
                <p className="text-subtle mt-1.5 text-sm leading-relaxed">{block.consequence}</p>
              </div>
            ))}
          </Section>

          <div className="grid gap-3 sm:grid-cols-3">
            <Callout icon="trending_up" tone="green" label="Force" text={verdict.force_principale} />
            <Callout icon="warning" tone="red" label="Risque" text={verdict.risque_principal} />
            <Callout
              icon="target"
              tone="blue"
              label="À changer en priorité"
              text={verdict.action_prioritaire}
            />
          </div>

          <div className="border-brand-blue bg-panel rounded-lg border p-4">
            <p className="text-brand-blue mb-1.5 text-xs font-semibold uppercase">
              Verdict sur le système
            </p>
            <p className="text-fg text-sm leading-relaxed">{verdict.verdict_systeme}</p>
          </div>

          <p className="text-subtle text-[11px] leading-relaxed">
            Chiffres et couleurs calculés par Fondanarex, sous test. Explications, lecture
            comportementale et conseils produits par Gemini à partir de ces chiffres uniquement —
            il ne connaît ni ta stratégie, ni ton état d&apos;esprit, ni le contexte de marché. Le
            MAE et le MFE ne figurent pas ici : ils exigent le parcours du prix pendant chaque
            trade, que le rapport MetaTrader ne contient pas.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-subtle mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase">
        <Icon name={icon} size={14} />
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// ── Bandes ────────────────────────────────────────────────────────────────

const TONE: Record<Grade, { bar: string; text: string; bg: string; icon: string }> = {
  good: {
    bar: "bg-brand-green",
    text: "text-brand-green",
    bg: "bg-brand-green/8",
    icon: "check_circle",
  },
  neutral: { bar: "bg-brand-amber", text: "text-brand-amber", bg: "bg-brand-amber/8", icon: "remove" },
  bad: { bar: "bg-brand-red", text: "text-brand-red", bg: "bg-brand-red/8", icon: "error" },
};

function money(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function duration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 90) return `${Math.round(minutes)} min`;
  if (minutes < 2880) return `${(minutes / 60).toFixed(1)} h`;
  return `${(minutes / 1440).toFixed(1)} j`;
}

/**
 * Every measure as a wide band, graded.
 *
 * Wide rather than a dense grid because the previous layout put twelve figures
 * in four columns of 10px type — legible only if you already knew what you were
 * looking for, which defeats the purpose.
 */
function Bands({ analytics, stats }: { analytics: JournalAnalytics; stats: DeepStats }) {
  const a = analytics;
  const s = stats;
  const mc = s.monteCarlo;

  const rows: GradedMetric[] = [
    {
      key: "expectancy",
      label: "Espérance par trade",
      value: money(s.expectancy),
      grade: GRADERS.expectancy(s.expectancy),
      scale: "positif = avantage réel",
      hint: s.expectancyR === null ? undefined : `${s.expectancyR} R`,
    },
    {
      key: "sqn",
      label: "SQN — qualité du système",
      value: s.sqn === null ? "—" : String(s.sqn),
      grade: GRADERS.sqn(s.sqn),
      scale: "bon ≥ 2,5 · difficile < 1,5",
    },
    {
      key: "payoff",
      label: "Rapport gain / perte moyens",
      value: a.payoffRatio === null ? "—" : `${a.payoffRatio}×`,
      grade: GRADERS.payoff(a.payoffRatio),
      scale: "bon ≥ 2 · fragile < 1",
      hint: `${money(a.averageWin)} contre ${money(a.averageLoss)} · ${a.winRate} % de réussite`,
    },
    {
      key: "sharpe",
      label: "Sharpe par trade",
      value: s.sharpe === null ? "—" : String(s.sharpe),
      grade: GRADERS.sharpe(s.sharpe),
      scale: "bon ≥ 0,3 · faible < 0,1",
      hint: s.sortino === null ? undefined : `Sortino ${s.sortino}`,
    },
    {
      key: "target",
      label: "Part de l'objectif encaissée",
      value: s.targetEfficiency === null ? "—" : `${s.targetEfficiency} %`,
      grade: GRADERS.targetEfficiency(s.targetEfficiency),
      scale: "bon ≥ 60 % · trop tôt < 40 %",
      hint: `sur ${s.targetEfficiencySample} trades gagnants avec objectif`,
    },
    {
      key: "stops",
      label: "Trades protégés par un stop",
      value: `${a.stopLossCoverage} %`,
      grade: GRADERS.stopCoverage(a.stopLossCoverage),
      scale: "bon ≥ 90 %",
      hint: a.medianRMultiple === null ? undefined : `résultat médian ${a.medianRMultiple} R`,
    },
    {
      key: "drawdown",
      label: "Drawdown subi",
      value: `−${money(s.maxDrawdown)}`,
      grade: GRADERS.recovered(s.drawdownRecovered),
      scale: s.drawdownRecovered ? "sommet regagné" : "sommet PAS encore regagné",
      hint: `${s.drawdownDurationTrades} trades sous le sommet`,
    },
    {
      key: "stress",
      label: "Drawdown probable au stress-test",
      value: mc === null ? "—" : `−${money(mc.p95MaxDrawdown)}`,
      grade: mc === null ? null : GRADERS.stressGap(mc.p95MaxDrawdown, s.maxDrawdown),
      scale: "proche du réel = ordre représentatif",
      hint: mc === null ? undefined : `95e centile sur ${mc.iterations} tirages`,
    },
    {
      key: "sizing",
      label: "Taille de position après une perte",
      value: a.lotAfterLoss === null ? "—" : `${a.lotAfterLoss} lots`,
      grade: GRADERS.sizingAfterLoss(a.lotAfterLoss, a.lotAfterWin),
      scale: "bon si ≤ la taille après un gain",
      hint: a.lotAfterWin === null ? undefined : `${a.lotAfterWin} lots après un gain`,
    },
    {
      key: "hold",
      label: "Durée des gagnants vs perdants",
      value: duration(a.holdMinutesOnWin),
      grade: GRADERS.holdRatio(a.holdMinutesOnWin, a.holdMinutesOnLoss),
      scale: "bon si les gagnants tiennent 2× plus",
      hint: `${duration(a.holdMinutesOnLoss)} sur les perdants`,
    },
    {
      key: "clustering",
      label: "Perte après une perte",
      value:
        s.autocorrelation.lossAfterLoss === null ? "—" : `${s.autocorrelation.lossAfterLoss} %`,
      grade: GRADERS.clustering(s.autocorrelation.lossAfterLoss, s.autocorrelation.baseLossRate),
      // The comparison that matters, spelled out: the level alone means nothing.
      scale: `à comparer aux ${s.autocorrelation.baseLossRate} % de référence`,
      hint: `sur ${s.autocorrelation.sampleAfterLoss} occasions`,
    },
    {
      key: "var",
      label: "Perte extrême attendue (VaR 95 %)",
      value: money(s.var95),
      grade: null,
      scale: "seuls 5 % des trades font pire",
      hint: s.cvar95 === null ? undefined : `moyenne au-delà : ${money(s.cvar95)}`,
    },
  ];

  return <div className="space-y-1.5">{rows.map((row) => <Band key={row.key} metric={row} />)}</div>;
}

function Band({ metric }: { metric: GradedMetric }) {
  const tone = metric.grade === null ? null : TONE[metric.grade];

  return (
    <div
      className={cn(
        "border-border-app flex items-center gap-3 overflow-hidden rounded-lg border",
        tone?.bg,
      )}
    >
      {/* Barre de couleur à gauche : lisible d'un coup d'œil, sans lire le chiffre. */}
      <div className={cn("h-full w-1.5 self-stretch", tone?.bar ?? "bg-border-app")} />

      <div className="min-w-0 flex-1 py-2.5">
        <p className="text-fg text-sm font-medium">{metric.label}</p>
        {metric.scale ? <p className="text-subtle text-[11px]">{metric.scale}</p> : null}
      </div>

      <div className="py-2.5 pr-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {tone ? <Icon name={tone.icon} size={15} className={tone.text} /> : null}
          <span className={cn("font-mono text-lg font-bold", tone?.text ?? "text-fg")}>
            {metric.value}
          </span>
        </div>
        {metric.hint ? <p className="text-subtle text-[11px]">{metric.hint}</p> : null}
      </div>
    </div>
  );
}

function Callout({
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
    <div className="border-border-app bg-bg rounded-lg border p-3.5">
      <div
        className={cn(
          "mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase",
          tone === "green"
            ? "text-brand-green"
            : tone === "red"
              ? "text-brand-red"
              : "text-brand-blue",
        )}
      >
        <Icon name={icon} size={14} />
        {label}
      </div>
      <p className="text-muted text-sm leading-relaxed">{text}</p>
    </div>
  );
}

// -- Historique ------------------------------------------------------------

/**
 * Past analyses, newest first.
 *
 * Each row carries the measures it was computed on and the delta against the
 * run before it, because "SQN 1.17" only becomes information next to the 0.94
 * it replaced. Opening a row shows the model text as it was written that day:
 * a verdict is a snapshot of a moment, not something to regenerate.
 */
function History({ runs }: { runs: AnalysisRunRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="border-border-app bg-bg rounded-lg border p-4">
      <p className="text-fg text-sm font-semibold">Analyses enregistrées</p>
      <p className="text-subtle mt-0.5 mb-3 text-[11px]">
        {runs.length} analyse{runs.length > 1 ? "s" : ""}. Clique sur une ligne pour relire ce que
        le modèle avait écrit ce jour-là.
      </p>

      <div className="space-y-1.5">
        {runs.map((run, index) => {
          // Runs are newest-first, so the one that came BEFORE sits after it.
          const previous = runs[index + 1];
          const delta =
            previous && run.sqn !== null && previous.sqn !== null ? run.sqn - previous.sqn : null;
          const expanded = open === run.id;

          return (
            <div key={run.id} className="border-border-app overflow-hidden rounded-lg border">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : run.id)}
                className="hover:bg-panel flex w-full items-center gap-3 p-2.5 text-left transition-colors"
              >
                <Icon
                  name={expanded ? "expand_less" : "expand_more"}
                  size={16}
                  className="text-subtle shrink-0"
                />

                <div className="min-w-0 flex-1">
                  <p className="text-fg text-xs font-medium">
                    {run.createdAt.toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    <span className="text-subtle font-normal">
                      {run.createdAt.toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                  <p className="text-subtle truncate text-[11px]">
                    {run.tradeCount} trades · {run.periodLabel}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-fg font-mono text-xs font-semibold">
                    SQN {run.sqn === null ? "—" : run.sqn.toFixed(2)}
                    {delta !== null && Math.abs(delta) > 0.001 ? (
                      <span
                        className={cn(
                          "ml-1.5 text-[11px]",
                          delta > 0 ? "text-brand-green" : "text-brand-red",
                        )}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta.toFixed(2)}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-subtle text-[10px]">
                    {run.winRate} % · {run.netPnl > 0 ? "+" : ""}
                    {run.netPnl.toFixed(2)}
                  </p>
                </div>
              </button>

              {expanded ? (
                <div className="border-border-app bg-panel border-t p-3">
                  {run.verdict === null ? (
                    <p className="text-subtle text-xs">
                      Le texte de cette analyse a été écrit par une version antérieure et ne peut
                      plus être affiché. Ses chiffres, eux, restent exacts.
                    </p>
                  ) : (
                    <>
                      <p className="text-fg mb-2 text-xs leading-relaxed">{run.verdict.synthese}</p>
                      <p className="text-muted mb-2 flex items-start gap-1.5 text-xs leading-relaxed">
                        <Icon name="target" size={13} className="text-brand-green mt-0.5 shrink-0" />
                        {run.verdict.action_prioritaire}
                      </p>
                      <p className="text-subtle text-[11px] italic">{run.verdict.verdict_systeme}</p>
                    </>
                  )}

                  <div className="border-border-app mt-3 flex items-center justify-between border-t pt-2">
                    <span className="text-subtle text-[10px]">
                      {run.tokens.toLocaleString("fr-FR")} tokens
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => startTransition(() => removeAnalysisRun(run.id))}
                      className="text-subtle hover:text-brand-red text-[11px] transition-colors disabled:opacity-40"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
