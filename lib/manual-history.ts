import "server-only";

import type { IndicatorHistory } from "@/lib/integrations/fxmacrodata";
import { prisma } from "@/lib/prisma";
import { IndicatorSource } from "@/lib/generated/prisma/enums";

/**
 * Full history of a hand-entered indicator, straight from our own DB.
 *
 * Some fields (the manufacturing PMI, proprietary — S&P Global sells it, no
 * free source exists anywhere; see lib/integrations/eurostat.ts's revert
 * history) can never be automated, but that does not mean they cannot have a
 * real chart: once a run of MANUAL rows exists — one period, one value each,
 * upserted the same way every other refresh writes — the detail page can
 * read them back exactly like it reads Eurostat or the ECB, just from our
 * own table instead of a live upstream fetch.
 */
export async function getManualHistory(
  currencyCode: string,
  indicatorKey: string,
  label: string,
): Promise<IndicatorHistory> {
  const rows = await prisma.indicatorValue.findMany({
    where: { currencyCode, indicatorKey, source: IndicatorSource.MANUAL },
    orderBy: { periodEnd: "asc" },
    select: { periodEnd: true, value: true },
  });

  return {
    name: label,
    points: rows.map((row) => ({
      date: row.periodEnd.toISOString(),
      value: Number(row.value),
    })),
  };
}

/**
 * (currency, field) pairs backfilled with a real MANUAL history — see
 * getManualHistory. Keyed by currency too, not just field: pmiManufacturing
 * is shared across USD (ISM), GBP and EUR (see FIELD_FOR_KIND in
 * indicator-category-grid.tsx) but each holds a DIFFERENT survey — only
 * EUR's German PMI has been backfilled, and USD/GBP must not light up as
 * clickable over data that was never entered for them.
 *
 * A static allowlist, not a DB count: the overview grid renders a card as
 * clickable per-field, synchronously, for all eight currencies at once — an
 * async row-count per indicator there would mean one extra query per card
 * instead of the one query the whole page already makes. The detail page
 * itself still handles an empty result gracefully ("Aucune donnée
 * historique trouvée."), so listing a pair here ahead of its first backfill
 * would only cost a dead link, never a crash.
 */
const MANUAL_HISTORY_FIELDS: ReadonlySet<string> = new Set([
  "EUR:pmiManufacturing",
  "EUR:zew",
  "EUR:ifo",
  "GBP:pmiManufacturing",
  "GBP:pmiServices",
]);

export function hasManualHistory(currencyCode: string, field: string): boolean {
  return MANUAL_HISTORY_FIELDS.has(`${currencyCode}:${field}`);
}
