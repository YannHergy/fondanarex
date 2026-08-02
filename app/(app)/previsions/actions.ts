"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { attachTo, removeAttachment } from "@/lib/attachments";
import { fetchGeoEvents, generateEventScenario, generateWeekAhead } from "@/lib/plan-research";
import { requireUserIdOrThrow } from "@/lib/session";
import { UploadError } from "@/lib/storage";
import {
  addSetup,
  deleteSetup,
  getOrCreateSetupReview,
  savePlanNotes,
  saveSetupReviewNotes,
  setNewsImpact,
  updateSetup,
} from "@/lib/week-plan";

/** "YYYY-MM-DD", and a Monday — the plan key is the week start, not any date in it. */
const weekStart = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => new Date(`${value}T00:00:00Z`).getUTCDay() === 1, {
    message: "La semaine doit commencer un lundi",
  });

const bias = z.enum(["Bullish", "Bearish", "Neutral"]);

/** Long-form fields. Bounded so a paste cannot write an unbounded row. */
const longText = z.string().max(8000).nullable();

const notesSchema = z.object({
  weekStart,
  fundamentalContext: longText.optional(),
  generalConclusions: longText.optional(),
  lessons: longText.optional(),
  nextWeekObjectives: longText.optional(),
});

export async function savePlan(input: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const { weekStart: week, ...notes } = notesSchema.parse(input);

  await savePlanNotes(userId, week, notes);
  revalidatePath("/previsions");
}

const createSetupSchema = z.object({
  weekStart,
  instrument: z.string().min(3).max(16),
});

export async function createSetup(input: unknown): Promise<{ id: string }> {
  const userId = await requireUserIdOrThrow();
  const parsed = createSetupSchema.parse(input);

  const id = await addSetup(userId, parsed.weekStart, parsed.instrument);
  revalidatePath("/previsions");
  return { id };
}

const updateSetupSchema = z.object({
  setupId: z.string().min(1),
  instrument: z.string().min(3).max(16).optional(),
  technicalBias: bias.optional(),
  entryZone: z.string().max(64).nullable().optional(),
  tp: z.string().max(64).nullable().optional(),
  sl: z.string().max(64).nullable().optional(),
  notes: longText.optional(),
  fundamentalNotes: longText.optional(),
  tailwinds: longText.optional(),
  headwinds: longText.optional(),
});

export async function saveSetup(input: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const { setupId, ...fields } = updateSetupSchema.parse(input);

  await updateSetup(userId, setupId, fields);
  revalidatePath("/previsions");
}

export async function removeSetup(setupId: string): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await deleteSetup(userId, z.string().min(1).parse(setupId));
  revalidatePath("/previsions");
}

const newsImpactSchema = z.object({
  weekStart,
  eventKey: z.string().min(1).max(48),
  note: z.string().max(4000),
});

export async function saveNewsImpact(input: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const parsed = newsImpactSchema.parse(input);

  await setNewsImpact(userId, parsed.weekStart, parsed.eventKey, parsed.note);
  revalidatePath("/previsions");
}

const reviewNotesSchema = z.object({
  setupId: z.string().min(1),
  notes: longText,
});

export async function saveReviewNotes(input: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const parsed = reviewNotesSchema.parse(input);

  await saveSetupReviewNotes(userId, parsed.setupId, parsed.notes);
  revalidatePath("/previsions");
}

/**
 * Uploads a screenshot against a setup, or against that setup's review.
 *
 * A FormData action rather than a JSON one: the file streams straight through
 * instead of being base64'd into a payload, which is what the legacy version
 * did before storing the result in localStorage.
 */
export async function uploadScreenshot(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireUserIdOrThrow();

  const parsed = z
    .object({ setupId: z.string().min(1), target: z.enum(["setup", "review"]) })
    .safeParse({ setupId: formData.get("setupId"), target: formData.get("target") });

  if (!parsed.success) return { ok: false, error: "Requête invalide" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun fichier reçu" };

  try {
    const parent =
      parsed.data.target === "review"
        ? ({
            kind: "setupReview" as const,
            id: await getOrCreateSetupReview(userId, parsed.data.setupId),
          })
        : ({ kind: "planSetup" as const, id: parsed.data.setupId });

    // Ownership of a setup is checked by the repository; for a review it is
    // checked while creating it, so both paths are covered before the write.
    await attachTo(userId, parent, file);

    revalidatePath("/previsions");
    return { ok: true };
  } catch (error) {
    // An upload rejection is the user's problem to fix (wrong format, too
    // large) and is shown as such; anything else is ours and stays generic.
    if (error instanceof UploadError) return { ok: false, error: error.message };
    return { ok: false, error: "Téléversement impossible" };
  }
}

export async function deleteScreenshot(attachmentId: string): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await removeAttachment(userId, z.string().min(1).parse(attachmentId));
  revalidatePath("/previsions");
}

// ── Panneaux de recherche IA ───────────────────────────────────────────────
//
// Nothing below persists anything: these are reading aids consulted while
// writing the plan. What the trader concludes goes into the plan's own fields.

const COUNTRY_NAMES: Record<string, string> = {
  USD: "États-Unis",
  EUR: "Zone euro",
  GBP: "Royaume-Uni",
  JPY: "Japon",
  CHF: "Suisse",
  CAD: "Canada",
  AUD: "Australie",
  NZD: "Nouvelle-Zélande",
};

const scenarioSchema = z.object({
  label: z.string().min(1).max(120),
  currency: z.string().regex(/^[A-Z]{3}$/),
  currentValue: z.string().max(32),
});

export async function requestEventScenario(input: unknown) {
  await requireUserIdOrThrow();
  const parsed = scenarioSchema.parse(input);

  return generateEventScenario({
    ...parsed,
    country: COUNTRY_NAMES[parsed.currency] ?? parsed.currency,
  });
}

export async function requestGeoEvents() {
  await requireUserIdOrThrow();
  return fetchGeoEvents();
}

const weekAheadSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  weekLabel: z.string().min(1).max(64),
  setupBias: z.string().max(200).nullable(),
});

export async function requestWeekAhead(input: unknown) {
  await requireUserIdOrThrow();
  const parsed = weekAheadSchema.parse(input);

  return generateWeekAhead({
    ...parsed,
    country: COUNTRY_NAMES[parsed.currency] ?? parsed.currency,
  });
}
