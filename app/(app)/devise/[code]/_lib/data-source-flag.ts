/**
 * Sources considered "live": an automated pull that actually ran recently, as
 * opposed to a seeded placeholder or a value nobody has re-fetched since.
 * Everything else — OECD (its own refresh has no working automation, see
 * refresh-macro.yml), MANUAL, DERIVED, or simply absent — gets the "needs a
 * manual check" star so a stale number is visible instead of silently
 * looking as current as the ones that really are.
 */
const LIVE_SOURCES = new Set(["FXMACRODATA", "FRED"]);

/**
 * Whether an indicator needs manual attention.
 *
 * Two distinct cases, both of which mean "nobody is refreshing this for you":
 *
 *   1. It HAS a value, but from a source that is not being refreshed
 *      (a seeded MANUAL row, or OECD whose automation has never run).
 *   2. It has NO value at all — the indicator is weighted in the currency's
 *      profile but nothing feeds it, so the scoring engine drops its weight
 *      from the denominator. `available` is what carries that: an indicator
 *      with no mapped field (the exported-commodity ones for the CAD/NZD,
 *      China demand, risk sentiment) shows "—" and must be flagged, while a
 *      computed one with no field either (US spillover, derived from the USD
 *      score) is available and must NOT be.
 */
export function needsManualCheck(
  field: string | undefined,
  dataSources: Record<string, string>,
  available = true,
): boolean {
  if (!available) return true;
  if (!field) return false;
  return !LIVE_SOURCES.has(dataSources[field] ?? "");
}

export const MANUAL_CHECK_TITLE =
  "Donnée non connectée à une source automatique (FXMacroData/FRED) — à vérifier ou recharger manuellement.";
