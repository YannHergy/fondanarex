import "server-only";

import { nextSnbAssessment } from "@/lib/integrations/ch-calendar";
import { prisma } from "@/lib/prisma";

/**
 * Keeps CHF's interestRate override carrying the correct "prochaine
 * publication" date, rolling forward automatically as each SNB assessment
 * passes.
 *
 * No live source exists for the SNB's own policy rate (an extensive cube
 * search this session found nothing reliable — see lib/integrations/snb.ts's
 * history), so the value stays FXMacroData's, independently verified against
 * Trading Economics (0%). What was missing was the date: FXMacroData
 * supplies no forecast-calendar entry for it, and nothing else attached one.
 * IndicatorOverride exists exactly for this — "a provider that has no
 * calendar for an indicator... is exactly when someone enters one by hand"
 * (see its schema doc) — so this writes ONLY the date via the override, at
 * the currently-confirmed value, rather than inventing a rate.
 */

const FIELD = "interestRate";
const CONFIRMED_RATE = 0;

export async function refreshChfRateDate(userId: string): Promise<{ nextRelease: string | null }> {
  const nextRelease = nextSnbAssessment(new Date());

  const existing = await prisma.indicatorOverride.findUnique({
    where: { userId_currencyCode_indicatorKey: { userId, currencyCode: "CHF", indicatorKey: FIELD } },
  });

  // Idempotent: skip the write once the stored date already matches, so this
  // doesn't touch updatedAt/previousValue on every refresh for no reason.
  const already = existing?.nextRelease?.toISOString().slice(0, 10);
  const target = nextRelease?.toISOString().slice(0, 10) ?? null;
  if (already === target) return { nextRelease: target };

  await prisma.indicatorOverride.upsert({
    where: { userId_currencyCode_indicatorKey: { userId, currencyCode: "CHF", indicatorKey: FIELD } },
    create: { userId, currencyCode: "CHF", indicatorKey: FIELD, value: CONFIRMED_RATE, nextRelease },
    update: { value: existing?.value ?? CONFIRMED_RATE, nextRelease },
  });

  return { nextRelease: target };
}
