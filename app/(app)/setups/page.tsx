import type { Metadata } from "next";

import { SetupsView } from "@/app/(app)/setups/_components/setups-view";
import { PageHeader } from "@/components/ui/card";
import {
  overallStat,
  setupStats,
  setupsUsedInJournal,
} from "@/domain/journal/setup-stats";
import { listStrategies, listTrades } from "@/lib/journal";
import { requireUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Mes setups" };
export const dynamic = "force-dynamic";

/**
 * Les setups du trader, et ce qu'ils valent RÉELLEMENT.
 *
 * Le taux de réussite affiché ici est mesuré sur son propre journal, pas lu
 * dans une constante. Les taux codés en dur ailleurs (entry-types.ts) sont
 * ceux d'un seul trader, figés au jour où ils ont été écrits ; ici chacun voit
 * les siens, et ils bougent à mesure que le journal se remplit.
 */
export default async function SetupsPage() {
  const userId = await requireUserId();

  const [declared, trades] = await Promise.all([
    listStrategies(userId),
    listTrades(userId),
  ]);

  const stats = setupStats(trades);
  const overall = overallStat(trades);

  // Un setup déjà étiqueté dans le journal mais jamais déclaré reste
  // proposable : le trader ne doit pas voir sa propre nomenclature disparaître
  // parce qu'il ne l'a pas saisie deux fois.
  const used = setupsUsedInJournal(trades);
  const known = [...new Set([...declared, ...used])].sort((a, b) => a.localeCompare(b, "fr"));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Mes setups"
        subtitle="Vos entrées, et le taux de réussite mesuré sur votre propre journal"
      />
      <SetupsView declared={declared} known={known} stats={stats} overall={overall} />
    </div>
  );
}
