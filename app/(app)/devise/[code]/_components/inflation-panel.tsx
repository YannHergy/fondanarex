import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  analyseInflation,
  levelLabel,
  trajectoryLabel,
  INFLATION_TARGET,
} from "@/domain/scoring/inflation-analysis";
import { cn } from "@/lib/utils";

/**
 * Inflation read on two axes at once.
 *
 * A CPI print alone is close to meaningless — what a central bank reacts to is
 * the combination of where inflation IS and where it is GOING. This panel shows
 * both and the verdict that follows, so the number in the table above has a
 * policy interpretation attached to it.
 */
export function InflationPanel({
  cpi,
  previousCpi,
}: {
  cpi: number;
  previousCpi: number | null;
}) {
  const analysis = analyseInflation(cpi, previousCpi);

  const hawkish = analysis.score > 0;
  const dovish = analysis.score < 0;

  const tone = hawkish ? "text-brand-red" : dovish ? "text-brand-green" : "text-subtle";

  return (
    <Card>
      <CardTitle icon="analytics">Analyse tripartite de l&apos;inflation</CardTitle>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="border-border-app bg-panel rounded-lg border p-3">
          <p className="text-subtle mb-1 text-[10px] font-bold tracking-widest uppercase">
            Trajectoire
          </p>
          <p
            className={cn(
              "flex items-center gap-1.5 text-sm font-bold",
              analysis.trajectory === "rising"
                ? "text-brand-red"
                : analysis.trajectory === "falling"
                  ? "text-brand-green"
                  : "text-subtle",
            )}
          >
            <Icon
              name={
                analysis.trajectory === "rising"
                  ? "trending_up"
                  : analysis.trajectory === "falling"
                    ? "trending_down"
                    : "trending_flat"
              }
              size={16}
            />
            {trajectoryLabel(analysis.trajectory)}
          </p>
          <p className="text-subtle mt-0.5 font-mono text-[11px]">
            {analysis.variation > 0 ? "+" : ""}
            {analysis.variation.toFixed(2)} pt
            {previousCpi === null ? " (aucun précédent)" : ` depuis ${analysis.previous} %`}
          </p>
        </div>

        <div className="border-border-app bg-panel rounded-lg border p-3">
          <p className="text-subtle mb-1 text-[10px] font-bold tracking-widest uppercase">
            Niveau — cible {INFLATION_TARGET} %
          </p>
          <p
            className={cn(
              "text-sm font-bold",
              analysis.level === "HIGH"
                ? "text-brand-red"
                : analysis.level === "LOW"
                  ? "text-brand-blue"
                  : "text-brand-green",
            )}
          >
            {levelLabel(analysis.level)}
          </p>
          <p className="text-subtle mt-0.5 font-mono text-[11px]">{analysis.current} % actuel</p>
        </div>
      </div>

      <div
        className={cn(
          "rounded-lg border p-3 text-center",
          hawkish
            ? "border-brand-red/30 bg-brand-red/5"
            : dovish
              ? "border-brand-green/30 bg-brand-green/5"
              : "border-border-app bg-panel",
        )}
      >
        <p className="text-subtle text-[10px] font-bold tracking-widest uppercase">
          {analysis.scenario}
        </p>
        <p className={cn("mt-1 font-mono text-3xl font-black", tone)}>
          {analysis.score > 0 ? "+" : ""}
          {analysis.score}
          <span className="text-subtle ml-1 text-xs font-normal">pts</span>
        </p>
        <p className={cn("text-[11px] font-bold tracking-wide uppercase", tone)}>
          {analysis.stanceLabel}
        </p>
      </div>

      <p className="text-muted mt-3 text-xs leading-relaxed">{analysis.reading}</p>

      <p className="text-subtle mt-2 text-[11px] leading-relaxed">
        Le score combine les deux axes plutôt que de lire le chiffre seul : une même baisse est
        rassurante à 3,4 % et inquiétante à 1,4 %, parce que la seconde va vers la déflation.
      </p>
    </Card>
  );
}
