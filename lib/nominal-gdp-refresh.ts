import "server-only";

import { periodEnd } from "@/domain/macro/period";
import { fetchNominalGdp } from "@/lib/integrations/nominal-gdp";
import { prisma } from "@/lib/prisma";
import { IndicatorSource } from "@/lib/generated/prisma/enums";

/**
 * Écrit le PIB nominal annuel, l'échelle qui rend les balances commerciales
 * comparables (voir lib/integrations/nominal-gdp.ts).
 *
 * Ne va sur le réseau que si la donnée stockée a plus de trente jours. Un PIB
 * annuel est publié une fois par an et révisé rarement : le rafraîchir à
 * chaque passage du cron ne changerait jamais rien, coûterait huit requêtes
 * et suffit à faire basculer la Banque mondiale en throttling — mesuré. Une
 * requête ratée n'écrit rien, donc la dernière valeur connue reste en place,
 * ce qui est le comportement voulu pour une constante d'échelle.
 */

const FIELD = "nominalGdp";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface NominalGdpRefreshReport {
  written: number;
  skipped: boolean;
  errors: string[];
}

export async function refreshNominalGdp(): Promise<NominalGdpRefreshReport> {
  const known = await prisma.currency.findMany({ select: { code: true } });
  const codes = new Set(known.map((c) => c.code));

  const existing = await prisma.indicatorValue.findMany({
    where: { indicatorKey: FIELD },
    select: { currencyCode: true, fetchedAt: true },
  });

  const freshest = new Map<string, Date>();
  for (const row of existing) {
    const seen = freshest.get(row.currencyCode);
    if (!seen || row.fetchedAt > seen) freshest.set(row.currencyCode, row.fetchedAt);
  }

  const cutoff = Date.now() - MAX_AGE_MS;
  const allFresh =
    codes.size > 0 &&
    [...codes].every((code) => {
      const at = freshest.get(code);
      return at !== undefined && at.getTime() > cutoff;
    });

  if (allFresh) return { written: 0, skipped: true, errors: [] };

  const readings = await fetchNominalGdp();
  const errors: string[] = [];
  let written = 0;

  for (const reading of readings) {
    if (reading.error || !codes.has(reading.currencyCode)) {
      if (reading.error) errors.push(`PIB ${reading.currencyCode}: ${reading.error}`);
      continue;
    }

    for (const point of reading.history) {
      const end = periodEnd(point.period);
      if (!end) {
        errors.push(`PIB ${reading.currencyCode}: période « ${point.period} » illisible`);
        continue;
      }

      await prisma.indicatorValue.upsert({
        where: {
          currencyCode_indicatorKey_period_source: {
            currencyCode: reading.currencyCode,
            indicatorKey: FIELD,
            period: point.period,
            source: IndicatorSource.WORLDBANK,
          },
        },
        create: {
          currencyCode: reading.currencyCode,
          indicatorKey: FIELD,
          value: point.value,
          period: point.period,
          periodEnd: end,
          source: IndicatorSource.WORLDBANK,
          fetchedAt: new Date(),
        },
        update: { value: point.value, periodEnd: end, fetchedAt: new Date() },
      });
      written += 1;
    }
  }

  return { written, skipped: false, errors };
}
