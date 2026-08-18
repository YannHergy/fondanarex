import "server-only";

import { cache } from "react";

import { getCurrencies } from "@/lib/currencies";
import { prisma } from "@/lib/prisma";

/**
 * The economic calendar, derived from the indicators the dashboards already
 * track.
 *
 * Deliberately NOT a separate news feed. Every indicator on a currency page
 * already carries its next publication date, its current reading and the one
 * before it — which is exactly what an economic calendar row is. Pulling a
 * second, unrelated feed would have produced a calendar whose events had no
 * connection to the figures actually driving the scores, and no way to tell
 * whether a release had already been ingested.
 *
 * The previous WeeklyEvent table was filled by hand, which is why the page was
 * empty: nobody had typed anything into it.
 */

/** French label per indicator key, matching what the currency pages show. */
const LABELS: Record<string, string> = {
  interestRate: "Taux directeur",
  cpi: "Inflation (CPI)",
  coreCpi: "Inflation sous-jacente",
  ppi: "PPI",
  gdpQoQ: "PIB (trimestriel)",
  unemployment: "Chômage",
  pmiManufacturing: "PMI manufacturier",
  pmiServices: "PMI services",
  retailSales: "Ventes au détail",
  wagePPI: "Salaires",
  tradeBalance: "Balance commerciale",
  currentAccount: "Compte courant",
  consumerConfidence: "Confiance des ménages",
  nfp: "NFP — Emplois non agricoles",
  corePce: "Core PCE",
  zew: "ZEW",
  ifo: "ifo",
  employmentChange: "Variation de l'emploi",
  commodityPrice: "Matières premières",
  oilPrice: "Pétrole (WTI)",
  tokyoCpi: "CPI Tokyo",
  riskSentiment: "Sentiment risque (VIX)",
};

/**
 * How heavily a release moves its currency.
 *
 * Ranked by the weight these indicators carry across the eight profiles rather
 * than by a generic convention: a policy-rate decision or an inflation print
 * is what repricing hangs on, while a PPI or a confidence survey rarely is.
 */
const HIGH_IMPACT = new Set(["interestRate", "cpi", "coreCpi", "nfp", "gdpQoQ", "unemployment"]);
const MEDIUM_IMPACT = new Set([
  "pmiManufacturing",
  "pmiServices",
  "employmentChange",
  "retailSales",
  "wagePPI",
  "tradeBalance",
  "corePce",
  "tokyoCpi",
]);

export type ReleaseImpact = "high" | "medium" | "low";

export interface Release {
  currencyCode: string;
  indicatorKey: string;
  label: string;
  /** Publication instant. */
  at: Date;
  /**
   * Whether the hour is genuine or a fallback. FXMacroData sometimes supplies
   * only a date; that lands at midnight, which is never a real publication
   * time and must not be displayed as "00:00".
   */
  hasTime: boolean;
  impact: ReleaseImpact;
  /** Reading currently published — the "previous" relative to this release. */
  previous: number | null;
  /**
   * Reading produced BY this release, once it has happened. Null while the
   * publication is still ahead: an economic calendar shows the actual only
   * after the fact, and inventing one would be worse than an empty cell.
   */
  actual: number | null;
}

function impactOf(indicatorKey: string): ReleaseImpact {
  if (HIGH_IMPACT.has(indicatorKey)) return "high";
  if (MEDIUM_IMPACT.has(indicatorKey)) return "medium";
  return "low";
}

/**
 * Every scheduled publication we know about, soonest first.
 *
 * Includes releases whose date has passed: those are the ones whose figure is
 * already in, and hiding them would drop the most useful rows of the week.
 */
export const getReleases = cache(async (userId: string): Promise<Release[]> => {
  const [rows, lastPulls, currencies] = await Promise.all([
    prisma.indicatorValue.findMany({
      where: { nextRelease: { not: null } },
      select: {
        currencyCode: true,
        indicatorKey: true,
        nextRelease: true,
        fetchedAt: true,
      },
      // Freshest write first. An indicator has one row per period AND per
      // source, and the seeded MANUAL rows carry an old release date with no
      // hour. Ordering by the release date would let one of those outrank the
      // FXMacroData row written minutes ago, and the calendar would show a
      // date from last winter at 00:00 instead of the real upcoming print.
      orderBy: { fetchedAt: "desc" },
    }),
    /**
     * Dernière récupération par (devise, indicateur), toutes sources et toutes
     * périodes confondues. C'est ce qui permet de distinguer « l'échéance est
     * passée » de « nous avons le chiffre ». Voir `ingested` plus bas.
     */
    prisma.indicatorValue.groupBy({
      by: ["currencyCode", "indicatorKey"],
      _max: { fetchedAt: true },
    }),
    getCurrencies(userId),
  ]);

  const lastPullByKey = new Map(
    lastPulls.map((r) => [`${r.currencyCode}:${r.indicatorKey}`, r._max.fetchedAt]),
  );

  // One row per (currency, indicator): the same indicator has a row per
  // period, and they all carry the same upcoming release date.
  const seen = new Set<string>();
  const releases: Release[] = [];

  for (const row of rows) {
    if (!row.nextRelease) continue;

    const key = `${row.currencyCode}:${row.indicatorKey}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const label = LABELS[row.indicatorKey];
    // An indicator with no French label is one the scoring engine ignores;
    // showing its raw key would be noise.
    if (!label) continue;

    const currency = currencies[row.currencyCode];
    const current = currency
      ? (currency as unknown as Record<string, unknown>)[row.indicatorKey]
      : undefined;
    const previousValue = currency?.previousData?.[row.indicatorKey];

    const at = row.nextRelease;

    /**
     * « Échue » ne veut pas dire « connue ».
     *
     * Ce booléen valait autrefois `at <= maintenant`, c'est-à-dire seulement
     * « l'heure prévue est passée ». La colonne « réel » affichait alors la
     * valeur que nous DÉTENIONS, qui est celle de la publication PRÉCÉDENTE
     * tant que la nouvelle n'a pas été récupérée — et « précédent » glissait
     * d'un cran, sur l'avant-dernière.
     *
     * Constaté sur le ZEW du 18/08/2026 : la ligne annonçait « réel 26,30 ·
     * précédent 10,50 », soit juillet et juin, alors que le chiffre du jour
     * était 34,2 et n'avait pas encore été saisi. Deux nombres faux, présentés
     * avec la même assurance qu'un vrai, là où les lignes à venir affichaient
     * honnêtement « en attente ».
     *
     * Le test porte donc désormais sur une PREUVE : avons-nous récupéré cet
     * indicateur, depuis n'importe quelle source, APRÈS l'instant de la
     * publication ? Si oui, ce que nous détenons en vient. Sinon, nous ne
     * savons rien de cette publication et la case reste vide.
     *
     * Il est délibérément conservateur. Une source dont la valeur n'a pas
     * bougé d'une publication à l'autre n'est pas réécrite (`writeRows`
     * n'écrit que les changements), donc sa date de récupération n'avance pas
     * et la ligne restera « en attente ». Mesuré le 2026-08-18 : 38 des 41
     * publications échues restent prouvées, les 3 écartées sont exactement
     * celles dont le chiffre manquait — ZEW, PMI services EUR et USD, tous
     * trois en saisie manuelle. Mieux vaut une case vide qu'un faux chiffre.
     */
    const lastPull = lastPullByKey.get(key) ?? null;
    const ingested = lastPull !== null && lastPull.getTime() > at.getTime();
    const published = at.getTime() <= Date.now() && ingested;

    // Midnight means the provider gave a date without a time (see Release.hasTime).
    const hasTime = at.getUTCHours() !== 0 || at.getUTCMinutes() !== 0;

    releases.push({
      currencyCode: row.currencyCode,
      indicatorKey: row.indicatorKey,
      label,
      at,
      hasTime,
      impact: impactOf(row.indicatorKey),
      // Before the release, what we hold IS the previous reading. After it,
      // what we hold is the actual and the prior row becomes the previous.
      previous: published
        ? typeof previousValue === "number"
          ? previousValue
          : null
        : typeof current === "number"
          ? current
          : null,
      actual: published && typeof current === "number" ? current : null,
    });
  }

  return releases.sort((a, b) => a.at.getTime() - b.at.getTime());
});
