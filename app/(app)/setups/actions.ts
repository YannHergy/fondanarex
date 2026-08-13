"use server";

import { setupStats } from "@/domain/journal/setup-stats";
import { listTrades } from "@/lib/journal";
import { reviewSetups, type SetupReviewResult } from "@/lib/setup-review";
import { requireUserIdOrThrow } from "@/lib/session";

/**
 * Revue IA des setups du trader.
 *
 * Les statistiques sont recalculées côté serveur depuis son journal plutôt
 * que reçues du client : l'analyse doit porter sur ses vrais chiffres, pas
 * sur ce qu'un navigateur veut bien envoyer.
 */
export async function reviewSetupsAction(): Promise<SetupReviewResult> {
  const userId = await requireUserIdOrThrow();
  const trades = await listTrades(userId);
  return reviewSetups(setupStats(trades));
}
