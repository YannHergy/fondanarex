import "server-only";

import { listAttachments, type AttachmentRow } from "@/lib/attachments";
import type { SetupCondition } from "@/domain/previsions/setup-analysis";
import { prisma } from "@/lib/prisma";
import { TechnicalBias as DbBias } from "@/lib/generated/prisma/enums";
import type { TechnicalBias } from "@/domain/plan/week-plan";

/**
 * Weekly plans.
 *
 * The legacy service kept every plan ever written in a single localStorage
 * object and rewrote all of it on each save. Here a plan is a row keyed by
 * `(userId, weekStart)`, its setups and notes are rows beneath it, and a save
 * touches only what changed.
 *
 * The unique key is what makes navigation safe: the legacy `navigateWeek`
 * saved the current plan and loaded the next one in the same tick, so a
 * double-click could write the plan being left into the week being entered.
 */

const BIAS_TO_DB: Record<TechnicalBias, DbBias> = {
  Bullish: DbBias.BULLISH,
  Bearish: DbBias.BEARISH,
  Neutral: DbBias.NEUTRAL,
};

const BIAS_FROM_DB: Record<DbBias, TechnicalBias> = {
  [DbBias.BULLISH]: "Bullish",
  [DbBias.BEARISH]: "Bearish",
  [DbBias.NEUTRAL]: "Neutral",
};

export interface SetupRow {
  id: string;
  instrument: string;
  technicalBias: TechnicalBias;
  entryZone: string | null;
  tp: string | null;
  sl: string | null;
  notes: string | null;
  fundamentalNotes: string | null;
  tailwinds: string | null;
  headwinds: string | null;
  /** Durée que le scénario couvre — borne la fenêtre des publications. */
  horizonDays: number | null;
  /** Biais macro conclu par l analyse, distinct du biais technique. */
  macroBias: string | null;
  /** Une condition par publication, peintes en bandes. */
  macroConditions: SetupCondition[] | null;
  position: number;
  screenshots: AttachmentRow[];
  review: {
    id: string;
    notes: string | null;
    screenshots: AttachmentRow[];
  } | null;
}

export interface WeekPlanRow {
  id: string;
  weekStart: string;
  fundamentalContext: string | null;
  generalConclusions: string | null;
  lessons: string | null;
  nextWeekObjectives: string | null;
  updatedAt: Date;
  setups: SetupRow[];
  newsImpacts: Record<string, string>;
}

function toDate(weekStart: string): Date {
  const date = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Semaine invalide : ${weekStart}`);
  return date;
}

/**
 * The plan for a week, creating an empty one on first visit.
 *
 * An upsert rather than a read-then-create: two tabs open on the same week
 * would otherwise race and one would fail on the unique key.
 */
export async function getOrCreateWeekPlan(
  userId: string,
  weekStart: string,
): Promise<WeekPlanRow> {
  const weekStartDate = toDate(weekStart);

  const plan = await prisma.weekPlan.upsert({
    where: { userId_weekStart: { userId, weekStart: weekStartDate } },
    create: { userId, weekStart: weekStartDate },
    update: {},
    include: {
      setups: { orderBy: { position: "asc" }, include: { review: true } },
      newsImpacts: true,
    },
  });

  // Attachments are fetched per setup rather than through a nested include so
  // the same `listAttachments` builds the URL everywhere — the route that
  // serves the bytes and the shape the UI renders cannot drift apart.
  const setups = await Promise.all(
    plan.setups.map(async (setup): Promise<SetupRow> => {
      const [screenshots, reviewShots] = await Promise.all([
        listAttachments(userId, { kind: "planSetup", id: setup.id }),
        setup.review
          ? listAttachments(userId, { kind: "setupReview", id: setup.review.id })
          : Promise.resolve([]),
      ]);

      return {
        id: setup.id,
        instrument: setup.instrument,
        technicalBias: BIAS_FROM_DB[setup.technicalBias],
        entryZone: setup.entryZone,
        tp: setup.tp,
        sl: setup.sl,
        notes: setup.notes,
        fundamentalNotes: setup.fundamentalNotes,
        tailwinds: setup.tailwinds,
        headwinds: setup.headwinds,
        horizonDays: setup.horizonDays,
        macroBias: setup.macroBias,
        macroConditions: (setup.macroConditions as SetupCondition[] | null) ?? null,
        position: setup.position,
        screenshots,
        review: setup.review
          ? { id: setup.review.id, notes: setup.review.notes, screenshots: reviewShots }
          : null,
      };
    }),
  );

  return {
    id: plan.id,
    weekStart,
    fundamentalContext: plan.fundamentalContext,
    generalConclusions: plan.generalConclusions,
    lessons: plan.lessons,
    nextWeekObjectives: plan.nextWeekObjectives,
    updatedAt: plan.updatedAt,
    setups,
    newsImpacts: Object.fromEntries(plan.newsImpacts.map((n) => [n.eventKey, n.impactNote])),
  };
}

export interface PlanNotesInput {
  fundamentalContext?: string | null;
  generalConclusions?: string | null;
  lessons?: string | null;
  nextWeekObjectives?: string | null;
}

export async function savePlanNotes(
  userId: string,
  weekStart: string,
  notes: PlanNotesInput,
): Promise<void> {
  const weekStartDate = toDate(weekStart);

  await prisma.weekPlan.upsert({
    where: { userId_weekStart: { userId, weekStart: weekStartDate } },
    create: { userId, weekStart: weekStartDate, ...notes },
    update: notes,
  });
}

/** Verifies the plan belongs to the user, returning its id. */
async function ownedPlanId(userId: string, weekStart: string): Promise<string> {
  const plan = await prisma.weekPlan.findUnique({
    where: { userId_weekStart: { userId, weekStart: toDate(weekStart) } },
    select: { id: true },
  });
  if (!plan) throw new Error("Plan introuvable");
  return plan.id;
}

/** Verifies a setup belongs to the user through its plan. */
async function ownedSetup(userId: string, setupId: string) {
  const setup = await prisma.planSetup.findFirst({
    where: { id: setupId, weekPlan: { userId } },
    select: { id: true, weekPlan: { select: { weekStart: true } } },
  });
  if (!setup) throw new Error("Setup introuvable");
  return setup;
}

export async function addSetup(
  userId: string,
  weekStart: string,
  instrument: string,
): Promise<string> {
  const weekPlanId = await ownedPlanId(userId, weekStart);

  const last = await prisma.planSetup.findFirst({
    where: { weekPlanId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const setup = await prisma.planSetup.create({
    data: {
      weekPlanId,
      instrument,
      technicalBias: DbBias.NEUTRAL,
      position: (last?.position ?? -1) + 1,
    },
    select: { id: true },
  });

  return setup.id;
}

export interface SetupInput {
  instrument?: string;
  technicalBias?: TechnicalBias;
  entryZone?: string | null;
  tp?: string | null;
  sl?: string | null;
  notes?: string | null;
  fundamentalNotes?: string | null;
  tailwinds?: string | null;
  headwinds?: string | null;
}

export async function updateSetup(
  userId: string,
  setupId: string,
  input: SetupInput,
): Promise<void> {
  await ownedSetup(userId, setupId);

  const { technicalBias, ...rest } = input;

  await prisma.planSetup.update({
    where: { id: setupId },
    data: {
      ...rest,
      ...(technicalBias ? { technicalBias: BIAS_TO_DB[technicalBias] } : {}),
    },
  });
}

export async function deleteSetup(userId: string, setupId: string): Promise<void> {
  // Scoped by the plan's owner, so an id from another account is a no-op
  // rather than a deletion. The review and its attachments cascade.
  await prisma.planSetup.deleteMany({ where: { id: setupId, weekPlan: { userId } } });
}

/**
 * Stores the note against a release.
 *
 * An empty note deletes the row instead of storing a blank one, so a cleared
 * field does not leave a record claiming the release was considered.
 */
export async function setNewsImpact(
  userId: string,
  weekStart: string,
  eventKey: string,
  note: string,
): Promise<void> {
  const weekPlanId = await ownedPlanId(userId, weekStart);
  const trimmed = note.trim();

  if (!trimmed) {
    await prisma.planNewsImpact.deleteMany({ where: { weekPlanId, eventKey } });
    return;
  }

  await prisma.planNewsImpact.upsert({
    where: { weekPlanId_eventKey: { weekPlanId, eventKey } },
    create: { weekPlanId, eventKey, impactNote: trimmed },
    update: { impactNote: trimmed },
  });
}

/** The review row for a setup, created on demand so a screenshot has somewhere to attach. */
export async function getOrCreateSetupReview(userId: string, setupId: string): Promise<string> {
  await ownedSetup(userId, setupId);

  const review = await prisma.setupReview.upsert({
    where: { setupId },
    create: { setupId },
    update: {},
    select: { id: true },
  });

  return review.id;
}

export async function saveSetupReviewNotes(
  userId: string,
  setupId: string,
  notes: string | null,
): Promise<void> {
  await ownedSetup(userId, setupId);

  await prisma.setupReview.upsert({
    where: { setupId },
    create: { setupId, notes },
    update: { notes },
  });
}

/** Week starts with a saved plan, most recent first. */
export async function listPlanWeeks(userId: string, limit = 12): Promise<string[]> {
  const plans = await prisma.weekPlan.findMany({
    where: { userId },
    orderBy: { weekStart: "desc" },
    take: limit,
    select: { weekStart: true },
  });

  return plans.map((plan) => plan.weekStart.toISOString().slice(0, 10));
}

export interface WeekTradeStats {
  count: number;
  pnl: number;
  winRate: number;
}

/**
 * Realised trading result for the week, shown alongside the review.
 *
 * Only closed trades count. Including open ones would mix realised outcomes
 * with unrealised marks and make the win rate meaningless.
 */
export async function getWeekTradeStats(
  userId: string,
  weekStart: string,
): Promise<WeekTradeStats> {
  const start = toDate(weekStart);
  const end = new Date(start.getTime() + 7 * 86_400_000);

  const trades = await prisma.trade.findMany({
    where: {
      // Trade.userId, not the account relation: accountId is nullable, so
      // going through it would drop trades entered without an account.
      userId,
      closedAt: { gte: start, lt: end, not: null },
    },
    select: { pnl: true },
  });

  const pnls = trades.map((trade) => Number(trade.pnl ?? 0));
  const wins = pnls.filter((pnl) => pnl > 0).length;

  return {
    count: pnls.length,
    pnl: Math.round(pnls.reduce((sum, pnl) => sum + pnl, 0) * 100) / 100,
    winRate: pnls.length === 0 ? 0 : Math.round((wins / pnls.length) * 100),
  };
}

/** The pairs the plan offers, from the flagged forecast set. */
export async function getForecastInstruments(): Promise<string[]> {
  const instruments = await prisma.instrument.findMany({
    where: { inForecastSet: true, isActive: true },
    orderBy: { symbol: "asc" },
    select: { symbol: true },
  });

  return instruments.map((instrument) => instrument.symbol);
}
