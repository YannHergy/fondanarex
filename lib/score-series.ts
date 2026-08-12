import "server-only";

import type { CurrencySeries } from "@/components/multi-score-chart";
import { prisma } from "@/lib/prisma";

/**
 * Historique de score de plusieurs devises, prêt à être superposé.
 *
 * Une seule requête pour toutes les devises demandées plutôt qu'une par
 * devise : la superposition en affiche jusqu'à huit, et huit allers-retours
 * séquentiels sur un hébergement serverless coûtent plus cher que la requête
 * elle-même.
 *
 * Les snapshots ne sont PAS filtrés par utilisateur. ScoreSnapshot porte bien
 * un userId, mais le score macro d'une devise est le même pour tout le monde —
 * il ne dépend que des données publiées. Filtrer par utilisateur ne ferait
 * que masquer l'historique rejoué, écrit sous le compte propriétaire.
 */
export async function getScoreSeries(codes: string[]): Promise<CurrencySeries[]> {
  if (codes.length === 0) return [];

  const rows = await prisma.scoreSnapshot.findMany({
    where: { currencyCode: { in: codes } },
    orderBy: { computedAt: "asc" },
    select: { currencyCode: true, total: true, computedAt: true },
  });

  const byCode = new Map<string, CurrencySeries>(
    codes.map((code) => [code, { code, points: [] }]),
  );

  for (const row of rows) {
    byCode.get(row.currencyCode)?.points.push({
      value: Number(row.total),
      at: row.computedAt.toISOString(),
    });
  }

  // L'ordre demandé est conservé : sur le comparateur, la devise de base doit
  // rester la première de la légende.
  return codes.map((code) => byCode.get(code)!).filter((s) => s.points.length > 0);
}
