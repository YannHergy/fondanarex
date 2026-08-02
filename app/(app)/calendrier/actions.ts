"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getWeekKey } from "@/domain/events/week";
import { prisma } from "@/lib/prisma";
import { requireUserIdOrThrow } from "@/lib/session";
import { EventImpact, Importance } from "@/lib/generated/prisma/enums";

const eventSchema = z.object({
  id: z.string().optional(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  name: z.string().min(1).max(200),
  /** "YYYY-MM-DD" */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** "HH:MM" */
  time: z.string().regex(/^\d{2}:\d{2}$/),
  importance: z.enum(["HIGH", "MEDIUM", "LOW"]),
  forecast: z.string().max(32).nullable(),
  previous: z.string().max(32).nullable(),
  actual: z.string().max(32).nullable(),
  impact: z
    .enum(["BULLISH_STRONG", "BULLISH", "NEUTRAL", "BEARISH", "BEARISH_STRONG"])
    .nullable(),
  pipsVariation: z.number().finite().nullable(),
  notes: z.string().max(2000).nullable(),
});

export async function saveWeeklyEvent(input: unknown): Promise<{ id: string }> {
  const userId = await requireUserIdOrThrow();
  const parsed = eventSchema.parse(input);

  // Times are entered in the user's wall clock and stored as UTC. The week key
  // is derived from the resulting instant, not from the typed date string, so
  // an event entered late in the evening cannot be filed under the wrong week.
  const scheduledAt = new Date(`${parsed.date}T${parsed.time}:00Z`);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Date ou heure invalide");
  }

  const data = {
    currencyCode: parsed.currencyCode,
    name: parsed.name,
    weekKey: getWeekKey(scheduledAt),
    scheduledAt,
    importance: parsed.importance as Importance,
    forecast: parsed.forecast,
    previous: parsed.previous,
    actual: parsed.actual,
    impact: parsed.impact as EventImpact | null,
    pipsVariation: parsed.pipsVariation,
    notes: parsed.notes,
  };

  if (parsed.id) {
    // updateMany rather than update: it scopes by userId, so a guessed id
    // cannot reach another user's row.
    await prisma.weeklyEvent.updateMany({ where: { id: parsed.id, userId }, data });
    revalidatePath("/", "layout");
    return { id: parsed.id };
  }

  const created = await prisma.weeklyEvent.create({
    data: { userId, ...data, fromCalendar: false },
  });

  revalidatePath("/", "layout");
  return { id: created.id };
}

export async function deleteWeeklyEvent(input: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const id = z.string().min(1).parse(input);

  await prisma.weeklyEvent.deleteMany({ where: { id, userId } });
  revalidatePath("/", "layout");
}
