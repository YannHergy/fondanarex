"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  JOURNAL_CATEGORIES,
  MAX_JOURNAL_ROWS,
  MAX_NEWS_ROWS,
} from "@/domain/pine/generator";
import { deleteConfig, loadConfig, saveConfig, type LoadedConfig } from "@/lib/pine";
import { requireUserIdOrThrow } from "@/lib/session";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal(""));
const time = z.string().regex(/^\d{2}:\d{2}$/).or(z.literal(""));
const currency = z.string().regex(/^[A-Z]{3}$/);

const newsRow = z.object({
  id: z.string().min(1).max(40),
  enabled: z.boolean(),
  date,
  time,
  label: z.string().max(80),
  currency,
  /** Validated so a malformed value cannot reach the generated source. */
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  width: z.number().int().min(1).max(5),
});

const journalRow = z.object({
  id: z.string().min(1).max(40),
  enabled: z.boolean(),
  date,
  time,
  currency,
  category: z.enum(JOURNAL_CATEGORIES),
  title: z.string().max(120),
  note: z.string().max(500),
  sentiment: z.enum(["bullish", "bearish", "neutral"]),
  appreciation: z.enum(["like", "neutral", "dislike"]),
});

const saveSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("news"),
    name: z.string().min(1).max(64),
    rows: z.array(newsRow).max(MAX_NEWS_ROWS),
  }),
  z.object({
    kind: z.literal("journal"),
    name: z.string().min(1).max(64),
    rows: z.array(journalRow).max(MAX_JOURNAL_ROWS),
  }),
]);

export async function persistConfig(input: unknown): Promise<{ id: string }> {
  const userId = await requireUserIdOrThrow();
  const parsed = saveSchema.parse(input);

  const id = await saveConfig(userId, parsed.kind, parsed.name.trim(), parsed.rows);
  revalidatePath("/indicateurs");
  return { id };
}

export async function fetchConfig(configId: string): Promise<LoadedConfig | null> {
  const userId = await requireUserIdOrThrow();
  return loadConfig(userId, z.string().min(1).parse(configId));
}

export async function removeConfig(configId: string): Promise<void> {
  const userId = await requireUserIdOrThrow();
  await deleteConfig(userId, z.string().min(1).parse(configId));
  revalidatePath("/indicateurs");
}
