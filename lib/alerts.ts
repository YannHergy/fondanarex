import "server-only";

import { describeChange, detectScoreChanges } from "@/domain/alerts/score-change";
import { getScoredCurrencies } from "@/lib/currencies";
import { prisma } from "@/lib/prisma";
import { AlertKind, AlertPriority } from "@/lib/generated/prisma/enums";

/**
 * Score-change alerting.
 *
 * Runs after every macro refresh: snapshot the scores, compare against the
 * previous snapshot, and raise an alert for each meaningful move.
 *
 * The legacy app had an alert centre and per-currency preferences but no
 * generator — 'score_change_majeur' was a declared type that nothing ever
 * created, so the screen only showed alerts triggered by its own test button.
 */

const PRIORITY_RANK: Record<AlertPriority, number> = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  CRITICAL: 3,
};

const SEVERITY_TO_PRIORITY = {
  CRITICAL: AlertPriority.CRITICAL,
  HIGH: AlertPriority.HIGH,
  NORMAL: AlertPriority.NORMAL,
} as const;

export interface AlertRun {
  snapshotted: number;
  created: number;
  suppressed: number;
}

/**
 * Snapshots current scores and raises alerts for changes against the previous
 * snapshot.
 *
 * Per-currency preferences are honoured here rather than at read time: an alert
 * the user has muted is never stored, so the badge count cannot include rows
 * they will never be shown.
 */
export async function recordScoresAndAlert(userId: string): Promise<AlertRun> {
  const currencies = await getScoredCurrencies(userId);
  const codes = Object.keys(currencies);
  if (codes.length === 0) return { snapshotted: 0, created: 0, suppressed: 0 };

  // Latest snapshot per currency, to compare against.
  const previousRows = await prisma.scoreSnapshot.findMany({
    where: { userId },
    orderBy: { computedAt: "desc" },
    distinct: ["currencyCode"],
    select: { currencyCode: true, total: true },
  });

  const previous: Record<string, number> = {};
  for (const row of previousRows) previous[row.currencyCode] = Number(row.total);

  const current: Record<string, number> = {};
  for (const currency of Object.values(currencies)) {
    current[currency.code] = currency.scores.total;
  }

  await prisma.scoreSnapshot.createMany({
    data: Object.values(currencies).map((currency) => ({
      userId,
      currencyCode: currency.code,
      total: currency.scores.total,
      rawTotal: currency.scores.rawTotal,
      realRate: currency.scores.realRate,
      axes: {
        growth: currency.scores.growth,
        inflation: currency.scores.inflation,
        employment: currency.scores.employment,
        trade: currency.scores.trade,
        monetary: currency.scores.monetary,
        pmi: currency.scores.pmi,
        sentiment: currency.scores.sentiment,
      },
      // Prisma types Json columns as InputJsonValue, which a typed array does
      // not structurally satisfy even though it serialises fine. The cast is
      // the narrowest way to say "this is plain JSON data".
      breakdown: (currency.scores.breakdown ?? undefined) as unknown as object | undefined,
      weightUsed: currency.scores.poidsUtilise ?? null,
    })),
  });

  const changes = detectScoreChanges(previous, current);
  if (changes.length === 0) {
    return { snapshotted: codes.length, created: 0, suppressed: 0 };
  }

  const preferences = await prisma.alertPreference.findMany({ where: { userId } });
  const preferenceByCurrency = new Map(preferences.map((p) => [p.currencyCode, p]));

  let created = 0;
  let suppressed = 0;

  for (const change of changes) {
    const priority = SEVERITY_TO_PRIORITY[change.severity];
    const preference = preferenceByCurrency.get(change.currencyCode);

    // No preference row means "not configured", which defaults to enabled —
    // a currency added later must not be silently muted.
    if (preference) {
      const muted = !preference.enabled;
      const belowThreshold =
        PRIORITY_RANK[priority] < PRIORITY_RANK[preference.minPriority as AlertPriority];
      if (muted || belowThreshold) {
        suppressed += 1;
        continue;
      }
    }

    const { title, message } = describeChange(change);

    await prisma.alert.create({
      data: {
        userId,
        kind:
          change.severity === "NORMAL" ? AlertKind.SCORE_CHANGE : AlertKind.SCORE_CHANGE_MAJOR,
        priority,
        currencyCode: change.currencyCode,
        title,
        message,
        context: {
          previous: change.previous,
          current: change.current,
          delta: change.delta,
          crossedVerdict: change.crossedVerdict,
        },
      },
    });
    created += 1;
  }

  return { snapshotted: codes.length, created, suppressed };
}
