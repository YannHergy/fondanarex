"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { CLOSE_TYPES, EMOTIONS_AFTER, EMOTIONS_BEFORE, SESSIONS } from "@/domain/journal/filters";
import { attachTo, removeAttachment } from "@/lib/attachments";
import {
  addStrategy,
  createTrade,
  deleteTrade,
  removeStrategy,
  updateTrade,
  type TradeInput,
} from "@/lib/journal";
import { requireUserIdOrThrow } from "@/lib/session";
import { UploadError } from "@/lib/storage";

const ENTRY_TYPES = [
  "M1_ENTRY",
  "M2_ENTRY",
  "A11_ENTRY",
  "A12_ENTRY",
  "A2_ENTRY",
  "A21_ENTRY",
  "A22_ENTRY",
  "GOLDEN_ENTRY",
] as const;

/** A price. Positive and finite — a zero price is a missing value, not a level. */
const price = z.number().finite().positive();

const tradeSchema = z
  .object({
    id: z.string().min(1).optional(),
    accountId: z.string().min(1).nullable().optional(),
    instrument: z.string().regex(/^[A-Z]{3}\/[A-Z]{3}$/),
    direction: z.enum(["Buy", "Sell"]),
    /** "YYYY-MM-DDTHH:mm" in the user's wall clock. */
    openedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    closedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    entryPrice: price,
    exitPrice: price.nullable().optional(),
    stopLoss: price.nullable().optional(),
    takeProfit: price.nullable().optional(),
    lotSize: z.number().finite().positive().max(1000),
    commission: z.number().finite().nullable().optional(),
    swap: z.number().finite().nullable().optional(),
    strategy: z.string().max(64).nullable().optional(),
    entryType: z.enum(ENTRY_TYPES).nullable().optional(),
    session: z.enum(SESSIONS).nullable().optional(),
    closeType: z.enum(CLOSE_TYPES).nullable().optional(),
    emotionBefore: z.enum(EMOTIONS_BEFORE).nullable().optional(),
    emotionAfter: z.enum(EMOTIONS_AFTER).nullable().optional(),
    notes: z.string().max(8000).nullable().optional(),
    tags: z.array(z.string().max(32)).max(20).optional(),
  })
  // A closed trade needs an exit price, and an exit price implies a close.
  // Allowing one without the other produces a trade that is neither open nor
  // valued, which every aggregate then has to guess about.
  .refine((value) => Boolean(value.closedAt) === Boolean(value.exitPrice), {
    message: "Une clôture exige un prix de sortie, et inversement",
    path: ["exitPrice"],
  })
  .refine(
    (value) => !value.closedAt || Date.parse(value.closedAt) >= Date.parse(value.openedAt),
    { message: "La clôture ne peut pas précéder l'entrée", path: ["closedAt"] },
  );

function toInput(parsed: z.infer<typeof tradeSchema>): TradeInput {
  return {
    accountId: parsed.accountId ?? null,
    instrument: parsed.instrument,
    direction: parsed.direction,
    // Entered in local wall clock, stored as UTC.
    openedAt: new Date(`${parsed.openedAt}:00Z`),
    closedAt: parsed.closedAt ? new Date(`${parsed.closedAt}:00Z`) : null,
    entryPrice: parsed.entryPrice,
    exitPrice: parsed.exitPrice ?? null,
    stopLoss: parsed.stopLoss ?? null,
    takeProfit: parsed.takeProfit ?? null,
    lotSize: parsed.lotSize,
    commission: parsed.commission ?? null,
    swap: parsed.swap ?? null,
    strategy: parsed.strategy ?? null,
    entryType: parsed.entryType ?? null,
    session: parsed.session ?? null,
    closeType: parsed.closeType ?? null,
    emotionBefore: parsed.emotionBefore ?? null,
    emotionAfter: parsed.emotionAfter ?? null,
    notes: parsed.notes ?? null,
    tags: parsed.tags ?? [],
  };
}

export async function saveTrade(input: unknown): Promise<{ id: string }> {
  const userId = await requireUserIdOrThrow();
  const parsed = tradeSchema.parse(input);

  if (parsed.id) {
    await updateTrade(userId, parsed.id, toInput(parsed));
    revalidatePath("/journal");
    return { id: parsed.id };
  }

  const id = await createTrade(userId, toInput(parsed));
  revalidatePath("/journal");
  revalidatePath("/rapports");
  return { id };
}

export async function removeTrade(tradeId: string): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await deleteTrade(userId, z.string().min(1).parse(tradeId));
  revalidatePath("/journal");
}

export async function createStrategy(name: string): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await addStrategy(userId, z.string().min(1).max(64).parse(name));
  revalidatePath("/journal");
}

export async function deleteStrategy(name: string): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await removeStrategy(userId, z.string().min(1).max(64).parse(name));
  revalidatePath("/journal");
}

export async function uploadTradeScreenshot(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await requireUserIdOrThrow();

  const parsed = z.object({ tradeId: z.string().min(1) }).safeParse({
    tradeId: formData.get("tradeId"),
  });
  if (!parsed.success) return { ok: false, error: "Requête invalide" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Aucun fichier reçu" };

  try {
    await attachTo(userId, { kind: "trade", id: parsed.data.tradeId }, file);
    revalidatePath("/journal");
    return { ok: true };
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: error.message };
    return { ok: false, error: "Téléversement impossible" };
  }
}

export async function deleteTradeScreenshot(attachmentId: string): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await removeAttachment(userId, z.string().min(1).parse(attachmentId));
  revalidatePath("/journal");
}
