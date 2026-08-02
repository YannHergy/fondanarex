import "server-only";

import { primaryCapture, buildSetupNote } from "@/domain/charts/timeframes";
import { pairFundamentalBias } from "@/domain/plan/week-plan";
import type { CurrencyWithScore } from "@/domain/types";
import { prisma } from "@/lib/prisma";
import { deleteAttachment, putAttachment } from "@/lib/storage";
import { TechnicalBias as DbBias } from "@/lib/generated/prisma/enums";

/**
 * Multi-timeframe chart captures.
 *
 * Captures are staged per pair until the trader promotes them onto a setup in
 * the weekly plan. The legacy screen staged them in IndexedDB as base64 — it
 * had moved there from localStorage precisely because "14 paires × 7 captures
 * JPEG ≈ 4-5 Mo → overflow silencieux → données perdues", which is the right
 * diagnosis and the wrong fix: the data was still trapped in one browser, on
 * one machine, invisible to everything else.
 *
 * Staged rows carry `stagingKey` (the pair) and no parent. Promotion re-parents
 * them onto the new PlanSetup and clears the key, so the bytes are uploaded
 * once and never copied.
 */

export interface CaptureRow {
  id: string;
  url: string;
  timeframe: string;
  isEntry: boolean;
}

const CAPTURE_SELECT = { id: true, timeframe: true, isEntry: true } as const;

function toRow(row: { id: string; timeframe: string | null; isEntry: boolean }): CaptureRow {
  return {
    id: row.id,
    url: `/api/attachments/${row.id}`,
    timeframe: row.timeframe ?? "",
    isEntry: row.isEntry,
  };
}

/** Staged captures for a pair, in the order they were taken. */
export async function listStagedCaptures(
  userId: string,
  pair: string,
): Promise<CaptureRow[]> {
  const rows = await prisma.attachment.findMany({
    where: { userId, stagingKey: pair },
    orderBy: { position: "asc" },
    select: CAPTURE_SELECT,
  });

  return rows.map(toRow);
}

/**
 * Stores a capture against a pair and timeframe.
 *
 * One capture per timeframe: uploading again replaces the previous one, blob
 * included, rather than accumulating versions the panel has no way to show.
 */
export async function stageCapture(
  userId: string,
  pair: string,
  timeframe: string,
  file: File,
): Promise<CaptureRow> {
  const stored = await putAttachment(userId, file);

  try {
    const existing = await prisma.attachment.findFirst({
      where: { userId, stagingKey: pair, timeframe },
      select: { id: true, blobPath: true, isEntry: true, position: true },
    });

    const row = await prisma.attachment.create({
      data: {
        userId,
        url: "",
        blobPath: stored.blobPath,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        stagingKey: pair,
        timeframe,
        // Replacing a capture keeps its entry flag and slot: the trader marked
        // that TIMEFRAME as the entry, not that particular image.
        isEntry: existing?.isEntry ?? false,
        position: existing?.position ?? (await nextPosition(userId, pair)),
      },
      select: CAPTURE_SELECT,
    });

    if (existing) {
      await prisma.attachment.delete({ where: { id: existing.id } });
      await deleteAttachment(existing.blobPath);
    }

    return toRow(row);
  } catch (error) {
    await deleteAttachment(stored.blobPath);
    throw error;
  }
}

async function nextPosition(userId: string, pair: string): Promise<number> {
  const last = await prisma.attachment.findFirst({
    where: { userId, stagingKey: pair },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
}

export async function removeStagedCapture(userId: string, captureId: string): Promise<void> {
  const row = await prisma.attachment.findFirst({
    where: { id: captureId, userId, stagingKey: { not: null } },
    select: { id: true, blobPath: true },
  });
  if (!row) return;

  await prisma.attachment.delete({ where: { id: row.id } });
  await deleteAttachment(row.blobPath);
}

/**
 * Marks one timeframe as the entry, clearing any previous mark.
 *
 * Exactly one at a time — the flag decides which capture represents the setup,
 * and two candidates would make that arbitrary.
 */
export async function markEntryCapture(
  userId: string,
  pair: string,
  captureId: string | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.attachment.updateMany({
      where: { userId, stagingKey: pair },
      data: { isEntry: false },
    });

    if (captureId) {
      await tx.attachment.updateMany({
        where: { id: captureId, userId, stagingKey: pair },
        data: { isEntry: true },
      });
    }
  });
}

export interface PromotionResult {
  setupId: string;
  captureCount: number;
  weekStart: string;
}

/**
 * Promotes the staged captures onto a new setup in a week's plan.
 *
 * The whole thing is one transaction. A partial promotion would be the worst
 * outcome available: a setup referencing captures still marked as staged, which
 * the Graphiques panel would keep offering to promote again.
 */
export async function promoteToWeekPlan(input: {
  userId: string;
  pair: string;
  weekStart: string;
  currencies: readonly CurrencyWithScore[];
}): Promise<PromotionResult> {
  const { userId, pair, weekStart } = input;

  const staged = await prisma.attachment.findMany({
    where: { userId, stagingKey: pair },
    orderBy: { position: "asc" },
    select: { id: true, timeframe: true, isEntry: true },
  });

  if (staged.length === 0) throw new Error("Aucune capture à enregistrer");

  const captures = staged.map((row) => ({
    id: row.id,
    timeframe: row.timeframe ?? "",
    isEntry: row.isEntry,
  }));

  const fundamental = pairFundamentalBias(pair, input.currencies);
  const weekStartDate = new Date(`${weekStart}T00:00:00Z`);

  const bias =
    fundamental.bias === "Bullish"
      ? DbBias.BULLISH
      : fundamental.bias === "Bearish"
        ? DbBias.BEARISH
        : DbBias.NEUTRAL;

  const setupId = await prisma.$transaction(async (tx) => {
    const plan = await tx.weekPlan.upsert({
      where: { userId_weekStart: { userId, weekStart: weekStartDate } },
      create: { userId, weekStart: weekStartDate },
      update: {},
      select: { id: true },
    });

    const last = await tx.planSetup.findFirst({
      where: { weekPlanId: plan.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const setup = await tx.planSetup.create({
      data: {
        weekPlanId: plan.id,
        instrument: pair,
        // The technical bias is seeded from the fundamental read rather than
        // left Neutral — it is the only directional information available at
        // this point, and the trader edits it in Prévisions.
        technicalBias: bias,
        position: (last?.position ?? -1) + 1,
        notes: buildSetupNote({
          captures,
          base: fundamental.base,
          quote: fundamental.quote,
          baseScore: fundamental.baseScore,
          quoteScore: fundamental.quoteScore,
        }),
      },
      select: { id: true },
    });

    // The primary capture leads, so the setup's first screenshot in Prévisions
    // is the one the analysis was entered on.
    const primary = primaryCapture(captures);
    const ordered = primary
      ? [primary, ...captures.filter((capture) => capture.id !== primary.id)]
      : captures;

    for (const [index, capture] of ordered.entries()) {
      await tx.attachment.update({
        where: { id: capture.id },
        data: {
          planSetupId: setup.id,
          stagingKey: null,
          position: index,
          caption: capture.timeframe,
        },
      });
    }

    return setup.id;
  });

  return { setupId, captureCount: staged.length, weekStart };
}

/** Pairs that currently have staged captures, for the panel's badge. */
export async function stagedPairCounts(userId: string): Promise<Record<string, number>> {
  const rows = await prisma.attachment.groupBy({
    by: ["stagingKey"],
    where: { userId, stagingKey: { not: null } },
    _count: { _all: true },
  });

  return Object.fromEntries(
    rows.filter((row) => row.stagingKey).map((row) => [row.stagingKey!, row._count._all]),
  );
}
