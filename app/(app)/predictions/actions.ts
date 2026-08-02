"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getIndicatorById } from "@/domain/data/fundamental-indicators";
import {
  clearPredictionLedger,
  deleteFundamentalEvent,
  recordFundamentalEvent,
  type RecordEventResult,
} from "@/lib/fundamental";
import { requireUserIdOrThrow } from "@/lib/session";

const eventSchema = z.object({
  indicatorId: z.string().min(1).max(48),
  /** "YYYY-MM-DD" */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  previous: z.number().finite(),
  forecast: z.number().finite(),
  actual: z.number().finite(),
  unit: z.string().max(16).nullable(),
  notes: z.string().max(2000).nullable(),
});

/**
 * Records a published figure.
 *
 * The indicator id is checked against the catalogue rather than trusted:
 * an unknown id would be stored happily and then never match a rule or a
 * cascade node, producing a row that silently affects nothing.
 */
export async function recordEvent(input: unknown): Promise<RecordEventResult> {
  const userId = await requireUserIdOrThrow();
  const parsed = eventSchema.parse(input);

  if (!getIndicatorById(parsed.indicatorId)) {
    throw new Error(`Indicateur inconnu : ${parsed.indicatorId}`);
  }

  // Figures are published on a day, not at an instant we know; noon UTC keeps
  // the event on the intended calendar day in every timezone the app is used
  // from, which a midnight timestamp would not.
  const occurredAt = new Date(`${parsed.date}T12:00:00Z`);
  if (Number.isNaN(occurredAt.getTime())) throw new Error("Date invalide");

  const result = await recordFundamentalEvent(
    userId,
    {
      indicatorId: parsed.indicatorId,
      occurredAt,
      previous: parsed.previous,
      forecast: parsed.forecast,
      actual: parsed.actual,
      unit: parsed.unit ?? undefined,
      notes: parsed.notes ?? undefined,
    },
    new Date(),
  );

  revalidatePath("/predictions");
  revalidatePath("/engrenage");
  return result;
}

export async function removeEvent(eventId: string): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await deleteFundamentalEvent(userId, z.string().min(1).parse(eventId));
  revalidatePath("/predictions");
}

export async function clearLedger(): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await clearPredictionLedger(userId);
  revalidatePath("/predictions");
}
