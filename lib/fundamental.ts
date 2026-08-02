import "server-only";

import {
  calculateCurrencyScore,
  calculateSurprise,
  propagateCascade,
  TRACKED_CURRENCIES,
  type CascadeImpact,
  type CurrencyFundamentalScore,
  type ScoredEvent,
} from "@/domain/fundamental/cascade";
import {
  directionForIndicator,
  effectiveStatus,
  predictionsFromEvent,
  resolutionFor,
  surpriseData,
  type PredictionStatus,
  type StoredPrediction,
  type SurpriseData,
} from "@/domain/fundamental/predictions";
import { getIndicatorById } from "@/domain/data/fundamental-indicators";
import type { PredictionDirection } from "@/domain/data/prediction-rules";
import { prisma } from "@/lib/prisma";
import {
  PredictionDirection as DbDirection,
  PredictionStatus as DbStatus,
} from "@/lib/generated/prisma/enums";

/**
 * Fundamental events and the predictions they fire.
 *
 * The legacy engine kept both in localStorage, which made the whole ledger
 * per-browser and unauditable. Here they are rows, and the write path is a
 * single transaction: recording a figure resolves the predictions that were
 * waiting on it and fires the new ones atomically, so a crash between the two
 * cannot leave a prediction permanently pending against a figure that already
 * published.
 */

const DIRECTION_TO_DB: Record<PredictionDirection, DbDirection> = {
  bullish: DbDirection.UP,
  bearish: DbDirection.DOWN,
};

const DIRECTION_FROM_DB: Partial<Record<DbDirection, PredictionDirection>> = {
  [DbDirection.UP]: "bullish",
  [DbDirection.DOWN]: "bearish",
};

const STATUS_TO_DB: Record<PredictionStatus, DbStatus> = {
  pending: DbStatus.PENDING,
  confirmed: DbStatus.CONFIRMED,
  contradicted: DbStatus.CONTRADICTED,
  expired: DbStatus.EXPIRED,
};

const STATUS_FROM_DB: Record<DbStatus, PredictionStatus> = {
  [DbStatus.PENDING]: "pending",
  [DbStatus.CONFIRMED]: "confirmed",
  [DbStatus.CONTRADICTED]: "contradicted",
  [DbStatus.EXPIRED]: "expired",
};

/** Window over which events still count toward a currency score. */
const SCORE_WINDOW_DAYS = 21;
/** Events older than this are not loaded at all — decay has flattened them. */
const EVENT_LOAD_DAYS = 90;

export interface RecordEventInput {
  indicatorId: string;
  occurredAt: Date;
  previous: number;
  forecast: number;
  actual: number;
  unit?: string;
  notes?: string;
}

export interface RecordEventResult {
  eventId: string;
  surpriseNormalized: number;
  cascadeImpacts: CascadeImpact[];
  predictionsCreated: number;
  predictionsResolved: number;
}

export interface FundamentalEventRow {
  id: string;
  indicatorId: string;
  indicatorName: string;
  currencyCode: string;
  occurredAt: Date;
  previous: number | null;
  forecast: number | null;
  actual: number | null;
  unit: string | null;
  surpriseNormalized: number;
  cascadeImpacts: CascadeImpact[];
  notes: string | null;
}

export interface PredictionRow extends StoredPrediction {
  /** Status as of read time — a lapsed pending row reads as expired. */
  status: PredictionStatus;
}

/**
 * Preview of what a figure would produce, without writing anything.
 *
 * Same code path as the real write, so what the user approves is exactly what
 * gets stored.
 */
export function previewEvent(input: RecordEventInput) {
  const indicator = getIndicatorById(input.indicatorId);
  const surpriseNormalized = calculateSurprise(input.actual, input.forecast, input.previous);

  return {
    indicator,
    surpriseNormalized,
    cascadeImpacts: propagateCascade(input.indicatorId, surpriseNormalized),
    predictions: predictionsFromEvent(
      input.indicatorId,
      indicator?.name ?? input.indicatorId,
      indicator?.currency ?? "GLOBAL",
      surpriseNormalized,
      input.occurredAt,
    ),
  };
}

/**
 * Records a published figure and updates the prediction ledger.
 *
 * Order matters. Predictions waiting on this indicator are resolved BEFORE the
 * new ones are fired, so a rule that both watches and triggers on the same
 * indicator cannot resolve itself with the very event that created it.
 */
export async function recordFundamentalEvent(
  userId: string,
  input: RecordEventInput,
  now: Date,
): Promise<RecordEventResult> {
  const indicator = getIndicatorById(input.indicatorId);
  if (!indicator) throw new Error(`Indicateur inconnu : ${input.indicatorId}`);

  const surpriseNormalized = calculateSurprise(input.actual, input.forecast, input.previous);
  const cascadeImpacts = propagateCascade(input.indicatorId, surpriseNormalized);
  const direction = directionForIndicator(indicator.id, surpriseNormalized);

  // Events on GLOBAL indicators (oil, VIX) have no currency row to attach to;
  // they are stored against the currency they most directly drive.
  const currencyCode = indicator.currency === "GLOBAL" ? "USD" : indicator.currency;

  return prisma.$transaction(async (tx) => {
    const event = await tx.fundamentalEvent.create({
      data: {
        userId,
        indicatorId: indicator.id,
        indicatorName: indicator.name,
        currencyCode,
        occurredAt: input.occurredAt,
        unit: input.unit ?? null,
        previous: input.previous,
        forecast: input.forecast,
        actual: input.actual,
        surpriseRaw: input.actual - input.forecast,
        surpriseNormalized,
        cascadeImpacts: cascadeImpacts as unknown as object,
        notes: input.notes ?? null,
      },
      select: { id: true },
    });

    let predictionsResolved = 0;

    if (direction) {
      // Resolution is judged against the EVENT's date, not the wall clock, and
      // happens BEFORE the expiry sweep. Both matter when back-filling, which
      // is the normal case — figures are entered after they publish. Expiring
      // first against `now` would retire a prediction that was perfectly live
      // on the day its target actually printed, so a month of history entered
      // in one sitting would resolve almost nothing.
      const resolvable = {
        userId,
        status: DbStatus.PENDING,
        targetIndicatorId: indicator.id,
        expiresAt: { gte: input.occurredAt },
        // A prediction fired by a LATER figure cannot be settled by this one.
        sourceEvent: { occurredAt: { lte: input.occurredAt } },
      };

      const confirmed = await tx.prediction.updateMany({
        where: { ...resolvable, predictedDirection: DIRECTION_TO_DB[direction] },
        data: {
          status: STATUS_TO_DB[resolutionFor(direction, direction)],
          resolvedAt: now,
          resolvedEventId: event.id,
          resolvedDirection: DIRECTION_TO_DB[direction],
        },
      });

      const contradicted = await tx.prediction.updateMany({
        where: { ...resolvable, predictedDirection: { not: DIRECTION_TO_DB[direction] } },
        data: {
          status: DbStatus.CONTRADICTED,
          resolvedAt: now,
          resolvedEventId: event.id,
          resolvedDirection: DIRECTION_TO_DB[direction],
        },
      });

      predictionsResolved = confirmed.count + contradicted.count;
    }

    // Retire only what had lapsed BEFORE this figure. Sweeping against `now`
    // instead would break back-fill: entering a month of history in one sitting
    // would expire every prediction on the first insert, and the later figures
    // that should have settled them would find nothing pending. Anything that
    // lapses after this point is caught by `effectiveStatus` on read, so the
    // screen is correct either way — this write only makes it durable.
    await tx.prediction.updateMany({
      where: { userId, status: DbStatus.PENDING, expiresAt: { lt: input.occurredAt } },
      data: { status: DbStatus.EXPIRED },
    });

    const drafts = predictionsFromEvent(
      indicator.id,
      indicator.name,
      indicator.currency,
      surpriseNormalized,
      input.occurredAt,
    );

    if (drafts.length > 0) {
      await tx.prediction.createMany({
        data: drafts.map((draft) => ({
          userId,
          sourceEventId: event.id,
          sourceIndicatorId: draft.sourceIndicatorId,
          sourceIndicatorName: draft.sourceIndicatorName,
          sourceCurrency: draft.sourceCurrency === "GLOBAL" ? currencyCode : draft.sourceCurrency,
          sourceDirection: DIRECTION_TO_DB[draft.sourceDirection],
          targetIndicatorId: draft.targetIndicatorId,
          targetIndicatorName: draft.targetIndicatorName,
          targetCurrency:
            draft.targetCurrency === "GLOBAL" ? currencyCode : draft.targetCurrency,
          predictedDirection: DIRECTION_TO_DB[draft.predictedDirection],
          confidence: draft.confidence,
          reason: draft.reason,
          delayLabel: draft.delayLabel,
          expiresAt: draft.expiresAt,
        })),
      });
    }

    return {
      eventId: event.id,
      surpriseNormalized,
      cascadeImpacts,
      predictionsCreated: drafts.length,
      predictionsResolved,
    };
  });
}

export async function deleteFundamentalEvent(userId: string, eventId: string): Promise<void> {
  // Predictions cascade-delete with their source event by schema, which is the
  // right call: a prediction fired by a figure that turned out to be a typo is
  // not evidence about anything.
  await prisma.fundamentalEvent.deleteMany({ where: { id: eventId, userId } });
}

export async function clearPredictionLedger(userId: string): Promise<void> {
  await prisma.fundamentalEvent.deleteMany({ where: { userId } });
}

function toEventRow(row: {
  id: string;
  indicatorId: string;
  indicatorName: string;
  currencyCode: string;
  occurredAt: Date;
  previous: unknown;
  forecast: unknown;
  actual: unknown;
  unit: string | null;
  surpriseNormalized: unknown;
  cascadeImpacts: unknown;
  notes: string | null;
}): FundamentalEventRow {
  return {
    id: row.id,
    indicatorId: row.indicatorId,
    indicatorName: row.indicatorName,
    currencyCode: row.currencyCode,
    occurredAt: row.occurredAt,
    previous: row.previous === null ? null : Number(row.previous),
    forecast: row.forecast === null ? null : Number(row.forecast),
    actual: row.actual === null ? null : Number(row.actual),
    unit: row.unit,
    surpriseNormalized: Number(row.surpriseNormalized ?? 0),
    cascadeImpacts: (row.cascadeImpacts as CascadeImpact[] | null) ?? [],
    notes: row.notes,
  };
}

function toPredictionRow(
  row: {
    id: string;
    sourceIndicatorId: string;
    sourceIndicatorName: string;
    sourceCurrency: string;
    sourceDirection: DbDirection;
    targetIndicatorId: string;
    targetIndicatorName: string;
    targetCurrency: string;
    predictedDirection: DbDirection;
    confidence: number;
    reason: string;
    delayLabel: string;
    status: DbStatus;
    expiresAt: Date;
    createdAt: Date;
    resolvedAt: Date | null;
    resolvedDirection: DbDirection | null;
  },
  now: Date,
): PredictionRow {
  const stored: StoredPrediction = {
    id: row.id,
    sourceIndicatorId: row.sourceIndicatorId,
    sourceIndicatorName: row.sourceIndicatorName,
    sourceCurrency: row.sourceCurrency,
    sourceDirection: DIRECTION_FROM_DB[row.sourceDirection] ?? "bullish",
    targetIndicatorId: row.targetIndicatorId,
    targetIndicatorName: row.targetIndicatorName,
    targetCurrency: row.targetCurrency,
    predictedDirection: DIRECTION_FROM_DB[row.predictedDirection] ?? "bullish",
    confidence: row.confidence,
    reason: row.reason,
    delayLabel: row.delayLabel,
    expiresAt: row.expiresAt,
    status: STATUS_FROM_DB[row.status],
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolvedDirection: row.resolvedDirection
      ? (DIRECTION_FROM_DB[row.resolvedDirection] ?? null)
      : null,
  };

  return { ...stored, status: effectiveStatus(stored, now) };
}

export interface PredictionOverview {
  surprise: SurpriseData[];
  scores: CurrencyFundamentalScore[];
  predictions: PredictionRow[];
  events: FundamentalEventRow[];
  totalPredictions: number;
}

/**
 * Everything the Prédictions screen needs, in three queries.
 *
 * Surprise is computed per currency in memory rather than with eight grouped
 * queries: the ledger is small, and the confidence weighting is not expressible
 * as a plain aggregate.
 */
export async function getPredictionOverview(
  userId: string,
  now: Date,
): Promise<PredictionOverview> {
  const eventCutoff = new Date(now.getTime() - EVENT_LOAD_DAYS * 86_400_000);

  const [predictions, events, totalPredictions] = await Promise.all([
    prisma.prediction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
    prisma.fundamentalEvent.findMany({
      where: { userId, occurredAt: { gte: eventCutoff } },
      orderBy: { occurredAt: "desc" },
      take: 200,
    }),
    prisma.prediction.count({ where: { userId } }),
  ]);

  const predictionRows = predictions.map((p) => toPredictionRow(p, now));
  const eventRows = events.map(toEventRow);

  const scored: ScoredEvent[] = eventRows.map((e) => ({
    indicatorId: e.indicatorId,
    currency: e.currencyCode,
    occurredAt: e.occurredAt,
    surpriseNormalized: e.surpriseNormalized,
    cascadeImpacts: e.cascadeImpacts,
  }));

  return {
    surprise: TRACKED_CURRENCIES.map((code) =>
      surpriseData(
        code,
        // A prediction counts for a currency if it was fired BY it or is about
        // it — the same claim can be evidence for two currencies, which is
        // correct for cross-currency rules.
        predictionRows.filter((p) => p.sourceCurrency === code || p.targetCurrency === code),
        now,
      ),
    ),
    scores: TRACKED_CURRENCIES.map((code) =>
      calculateCurrencyScore(code, scored, now, SCORE_WINDOW_DAYS),
    ),
    predictions: predictionRows,
    events: eventRows,
    totalPredictions,
  };
}
