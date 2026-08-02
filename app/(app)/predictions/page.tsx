import type { Metadata } from "next";

import { EventEntry } from "@/app/(app)/predictions/_components/event-entry";
import { Predictor } from "@/app/(app)/predictions/_components/predictor";
import { SurpriseTracker } from "@/app/(app)/predictions/_components/surprise-tracker";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { biasLabel } from "@/domain/fundamental/cascade";
import { getPredictionOverview } from "@/lib/fundamental";
import { requireUserId } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Prédictions" };
export const dynamic = "force-dynamic";

function scoreTone(score: number): string {
  if (score >= 58) return "text-brand-green";
  if (score <= 42) return "text-brand-red";
  return "text-subtle";
}

export default async function PredictionsPage() {
  const userId = await requireUserId();
  const overview = await getPredictionOverview(userId, new Date());

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Prédictions fondamentales"
        subtitle="Anticiper les enchaînements macro, puis mesurer si le marché les a respectés"
      />

      <Card className="border-brand-blue/30 bg-brand-blue/5">
        <div className="flex items-start gap-2.5">
          <Icon name="info" size={16} className="text-brand-blue mt-0.5 shrink-0" />
          <p className="text-muted text-sm leading-relaxed">
            Une publication qui s&apos;écarte du consensus se propage dans le graphe fondamental et
            déclenche des règles datées sur les publications suivantes. Quand celles-ci sortent, la
            prédiction est <strong>confirmée ou contredite</strong> — et le taux de contradiction
            devient l&apos;indicateur d&apos;étonnement : la mesure de l&apos;écart entre le modèle
            et le marché réel.
          </p>
        </div>
      </Card>

      {overview.events.length > 0 ? (
        <Card>
          <CardTitle icon="speed">Score fondamental cumulé (21 jours)</CardTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {overview.scores.map((score) => (
              <div
                key={score.currency}
                className="border-border-app bg-panel rounded-lg border p-2.5"
              >
                <div className="mb-1.5 flex items-center justify-between gap-1">
                  <CurrencyBadge code={score.currency} size="sm" />
                  <span className="text-subtle font-mono text-[10px]">{score.eventsCount} évt</span>
                </div>
                <p className={cn("font-mono text-xl font-black", scoreTone(score.score))}>
                  {score.score}
                </p>
                <p className={cn("text-[10px] font-semibold", scoreTone(score.score))}>
                  {biasLabel(score.bias)}
                </p>
                <p className="text-subtle mt-1 font-mono text-[10px]">
                  conviction {score.conviction}/5
                </p>
              </div>
            ))}
          </div>
          <p className="text-subtle mt-3 text-[11px] leading-relaxed">
            Somme des impacts reçus par le nœud directeur de chaque devise, pondérée par
            l&apos;ancienneté (demi-vie de neuf jours). 50 = neutre. Une conviction basse signale
            des publications qui se contredisent, pas une absence de mouvement.
          </p>
        </Card>
      ) : null}

      <SurpriseTracker
        surprise={overview.surprise}
        predictions={overview.predictions}
        totalPredictions={overview.totalPredictions}
      />

      <Predictor />

      <EventEntry events={overview.events} />
    </div>
  );
}
