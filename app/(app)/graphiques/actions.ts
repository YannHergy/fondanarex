"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CAPTURE_TIMEFRAMES } from "@/domain/charts/timeframes";
import { weekStartOf } from "@/domain/plan/week-plan";
import {
  markEntryCapture,
  promoteToWeekPlan,
  removeStagedCapture,
  stageCapture,
  type CaptureRow,
  type PromotionResult,
} from "@/lib/chart-captures";
import { getScoredCurrencyList } from "@/lib/currencies";
import { requireUserIdOrThrow } from "@/lib/session";
import { UploadError } from "@/lib/storage";

const pairSchema = z.string().regex(/^[A-Z]{3}\/[A-Z]{3}$/);

/** Only the seven timeframes the capture panel offers. */
const timeframeSchema = z.enum(
  CAPTURE_TIMEFRAMES.map((tf) => tf.value) as [string, ...string[]],
);

export async function uploadCapture(
  formData: FormData,
): Promise<{ ok: true; capture: CaptureRow } | { ok: false; error: string }> {
  const userId = await requireUserIdOrThrow();

  const parsed = z
    .object({ pair: pairSchema, timeframe: timeframeSchema })
    .safeParse({ pair: formData.get("pair"), timeframe: formData.get("timeframe") });

  if (!parsed.success) return { ok: false, error: "Requête invalide" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun fichier reçu" };

  try {
    const capture = await stageCapture(userId, parsed.data.pair, parsed.data.timeframe, file);
    revalidatePath("/graphiques");
    return { ok: true, capture };
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: error.message };
    return { ok: false, error: "Téléversement impossible" };
  }
}

export async function deleteCapture(captureId: string): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await removeStagedCapture(userId, z.string().min(1).parse(captureId));
  revalidatePath("/graphiques");
}

export async function setEntryCapture(input: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const parsed = z
    .object({ pair: pairSchema, captureId: z.string().min(1).nullable() })
    .parse(input);

  await markEntryCapture(userId, parsed.pair, parsed.captureId);
  revalidatePath("/graphiques");
}

/**
 * Turns the staged captures into a setup in the weekly plan.
 *
 * The week is resolved server-side from the clock rather than taken from the
 * client, so a stale tab left open over a weekend cannot file Monday's analysis
 * into the week that just ended.
 */
export async function saveToForecast(input: unknown): Promise<PromotionResult> {
  const userId = await requireUserIdOrThrow();
  const { pair } = z.object({ pair: pairSchema }).parse(input);

  const currencies = await getScoredCurrencyList(userId);

  const result = await promoteToWeekPlan({
    userId,
    pair,
    weekStart: weekStartOf(new Date()),
    currencies,
  });

  revalidatePath("/graphiques");
  revalidatePath("/previsions");
  return result;
}
