"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUserIdOrThrow } from "@/lib/session";
import { AlertPriority } from "@/lib/generated/prisma/enums";

const ID = z.string().min(1);

/**
 * Every mutation scopes its WHERE by userId as well as the row id. Matching on
 * id alone would let a guessed identifier mutate another user's row — the app
 * is single-tenant today, but the boundary is cheap to keep and expensive to
 * retrofit.
 */

export async function markAlertRead(input: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const id = ID.parse(input);

  await prisma.alert.updateMany({
    where: { id, userId },
    data: { read: true, readAt: new Date() },
  });

  revalidatePath("/", "layout");
}

export async function dismissAlert(input: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const id = ID.parse(input);

  await prisma.alert.updateMany({
    where: { id, userId },
    data: { dismissed: true, read: true, readAt: new Date() },
  });

  revalidatePath("/", "layout");
}

export async function markAllRead(): Promise<{ count: number }> {
  const userId = await requireUserIdOrThrow();

  const { count } = await prisma.alert.updateMany({
    where: { userId, read: false },
    data: { read: true, readAt: new Date() },
  });

  revalidatePath("/", "layout");
  return { count };
}

export async function clearDismissed(): Promise<{ count: number }> {
  const userId = await requireUserIdOrThrow();

  const { count } = await prisma.alert.deleteMany({ where: { userId, dismissed: true } });

  revalidatePath("/", "layout");
  return { count };
}

const preferenceSchema = z.object({
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  enabled: z.boolean(),
  minPriority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]),
});

export async function saveAlertPreference(input: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const { currencyCode, enabled, minPriority } = preferenceSchema.parse(input);

  await prisma.alertPreference.upsert({
    where: { userId_currencyCode: { userId, currencyCode } },
    create: { userId, currencyCode, enabled, minPriority: minPriority as AlertPriority },
    update: { enabled, minPriority: minPriority as AlertPriority },
  });

  revalidatePath("/alertes");
}
