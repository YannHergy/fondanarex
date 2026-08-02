import type { Metadata } from "next";

import { ConflictChecker } from "@/app/(app)/correlations/_components/conflict-checker";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { CORR_PAIRS, getCorrelation } from "@/domain/data/correlations";
import { getSettings } from "@/lib/settings";
import { requireUserId } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Corrélations" };

/**
 * Heatmap cell styling.
 *
 * Written as literal class strings rather than composed at runtime: Tailwind
 * extracts class names by scanning the source, so an interpolated class
 * produces no CSS at all.
 */
function cellClass(correlation: number, isDiagonal: boolean): string {
  if (isDiagonal) return "bg-panel text-subtle";
  if (correlation === 0) return "text-subtle";
  if (correlation >= 75) return "bg-brand-red/30 text-brand-red font-bold";
  if (correlation >= 60) return "bg-brand-amber/25 text-brand-amber font-semibold";
  if (correlation >= 40) return "bg-brand-amber/15 text-brand-amber";
  if (correlation >= 20) return "bg-brand-green/15 text-brand-green";
  if (correlation > 0) return "bg-brand-green/10 text-brand-green/80";
  return "bg-brand-blue/20 text-brand-blue";
}

function cellLabel(correlation: number, isDiagonal: boolean): string {
  if (isDiagonal) return "—";
  if (correlation === 0) return "·";
  return `${correlation > 0 ? "+" : ""}${correlation}`;
}

const LEGEND = [
  { label: "≥ 75 % — même trade", className: "bg-brand-red/30 text-brand-red" },
  { label: "60–74 % — double exposition", className: "bg-brand-amber/25 text-brand-amber" },
  { label: "40–59 % — exposition notable", className: "bg-brand-amber/15 text-brand-amber" },
  { label: "1–39 % — faible", className: "bg-brand-green/10 text-brand-green/80" },
  { label: "négative — sens opposés", className: "bg-brand-blue/20 text-brand-blue" },
] as const;

export default async function CorrelationsPage() {
  await requireUserId();
  const settings = await getSettings();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Corrélations"
        subtitle="Co-mouvement entre paires et contrôle d'exposition"
      />

      <Card className="overflow-x-auto">
        <CardTitle icon="grid_on">Matrice de corrélation</CardTitle>
        <table className="w-full min-w-[720px] text-xs">
          <caption className="sr-only">
            Corrélation historique entre chaque paire, en pourcentage
          </caption>
          <thead>
            <tr>
              <th className="p-1" />
              {CORR_PAIRS.map((pair) => (
                <th
                  key={pair}
                  scope="col"
                  className="text-subtle p-1 font-mono text-[9px] whitespace-nowrap"
                >
                  {pair.replace("/", "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CORR_PAIRS.map((rowPair) => (
              <tr key={rowPair}>
                <th
                  scope="row"
                  className="text-fg p-1 text-left font-mono text-[10px] whitespace-nowrap"
                >
                  {rowPair}
                </th>
                {CORR_PAIRS.map((colPair) => {
                  const isDiagonal = rowPair === colPair;
                  const correlation = getCorrelation(rowPair, colPair);
                  return (
                    <td key={colPair} className="p-0.5 text-center">
                      <span
                        className={cn(
                          "tabular inline-block w-10 rounded px-1 py-1 font-mono text-[10px]",
                          cellClass(correlation, isDiagonal),
                        )}
                        title={`${rowPair} × ${colPair} : ${correlation} %`}
                      >
                        {cellLabel(correlation, isDiagonal)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex flex-wrap gap-2">
          {LEGEND.map((item) => (
            <span
              key={item.label}
              className={cn("rounded px-2 py-1 text-[10px]", item.className)}
            >
              {item.label}
            </span>
          ))}
        </div>

        <p className="text-subtle mt-2 text-[11px] leading-relaxed">
          Une case vide (·) signifie « non mesurée », traitée comme indépendante : le vérificateur
          ne signalera pas une relation que personne n&apos;a enregistrée.
        </p>
      </Card>

      <ConflictChecker defaultRiskPct={settings.riskPct} />

      <Card className="border-brand-blue/30 bg-brand-blue/5">
        <div className="flex items-start gap-2.5">
          <Icon name="info" size={16} className="text-brand-blue mt-0.5 shrink-0" />
          <p className="text-muted text-sm leading-relaxed">
            La corrélation seule ne suffit pas : c&apos;est la <strong>corrélation effective</strong>{" "}
            — corrigée du sens des positions — qui détermine le risque réel. Deux paires corrélées à
            +90 % prises en sens opposés s&apos;annulent, tandis que deux paires corrélées à −40 %
            prises en sens opposés se renforcent.
          </p>
        </div>
      </Card>
    </div>
  );
}
