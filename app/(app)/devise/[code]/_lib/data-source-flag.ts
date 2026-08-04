/**
 * Sources considered "live": an automated pull that actually ran recently, as
 * opposed to a seeded placeholder or a value nobody has re-fetched since.
 * Everything else — OECD (its own refresh has no working automation, see
 * refresh-macro.yml), MANUAL, DERIVED, or simply absent — gets the "needs a
 * manual check" star so a stale number is visible instead of silently
 * looking as current as the ones that really are.
 */
const LIVE_SOURCES = new Set(["FXMACRODATA", "FRED"]);

export function needsManualCheck(
  field: string | undefined,
  dataSources: Record<string, string>,
): boolean {
  if (!field) return false;
  return !LIVE_SOURCES.has(dataSources[field] ?? "");
}

export const MANUAL_CHECK_TITLE =
  "Donnée non connectée à une source automatique (FXMacroData/FRED) — à vérifier ou recharger manuellement.";
