import "server-only";

import type { JournalRow, NewsRow } from "@/domain/pine/generator";
import { prisma } from "@/lib/prisma";
import { PineConfigKind } from "@/lib/generated/prisma/enums";

/**
 * Saved Pine generator configurations.
 *
 * The legacy screen kept these in localStorage under two keys, so a set of news
 * lines built on one machine did not exist on another. Here they are rows, and
 * the `(userId, kind, name)` unique key means saving under an existing name
 * replaces it rather than silently accumulating duplicates the picker cannot
 * tell apart.
 */

export type ConfigKind = "news" | "journal";

const KIND_TO_DB: Record<ConfigKind, PineConfigKind> = {
  news: PineConfigKind.NEWS_LINES,
  journal: PineConfigKind.EVENT_JOURNAL,
};

export interface SavedConfig {
  id: string;
  name: string;
  kind: ConfigKind;
  rowCount: number;
  updatedAt: Date;
}

export interface LoadedConfig extends SavedConfig {
  rows: NewsRow[] | JournalRow[];
}

export async function listConfigs(userId: string, kind: ConfigKind): Promise<SavedConfig[]> {
  const configs = await prisma.pineConfig.findMany({
    where: { userId, kind: KIND_TO_DB[kind] },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, rows: true, updatedAt: true },
  });

  return configs.map((config) => ({
    id: config.id,
    name: config.name,
    kind,
    rowCount: Array.isArray(config.rows) ? config.rows.length : 0,
    updatedAt: config.updatedAt,
  }));
}

export async function loadConfig(
  userId: string,
  configId: string,
): Promise<LoadedConfig | null> {
  const config = await prisma.pineConfig.findFirst({
    where: { id: configId, userId },
  });
  if (!config) return null;

  const rows = Array.isArray(config.rows) ? (config.rows as unknown as NewsRow[]) : [];

  return {
    id: config.id,
    name: config.name,
    kind: config.kind === PineConfigKind.EVENT_JOURNAL ? "journal" : "news",
    rowCount: rows.length,
    rows,
    updatedAt: config.updatedAt,
  };
}

export async function saveConfig(
  userId: string,
  kind: ConfigKind,
  name: string,
  rows: NewsRow[] | JournalRow[],
): Promise<string> {
  const config = await prisma.pineConfig.upsert({
    where: { userId_kind_name: { userId, kind: KIND_TO_DB[kind], name } },
    create: { userId, kind: KIND_TO_DB[kind], name, rows: rows as unknown as object },
    update: { rows: rows as unknown as object },
    select: { id: true },
  });

  return config.id;
}

export async function deleteConfig(userId: string, configId: string): Promise<void> {
  await prisma.pineConfig.deleteMany({ where: { id: configId, userId } });
}

export interface UpcomingRelease {
  currency: string;
  key: string;
  date: string;
}

/**
 * Scheduled releases inside a date window, for pre-filling the news rows.
 *
 * The point of the screen is drawing lines where the week's releases land, and
 * those dates are already in the currency records — retyping them by hand is
 * how a line ends up on the wrong day.
 */
export async function upcomingReleases(
  userId: string,
  from: string,
  to: string,
): Promise<UpcomingRelease[]> {
  const { getScoredCurrencyList } = await import("@/lib/currencies");
  const currencies = await getScoredCurrencyList(userId);

  const releases: UpcomingRelease[] = [];

  for (const currency of currencies) {
    for (const [key, date] of Object.entries(currency.nextReleases ?? {})) {
      if (!date || date < from || date > to) continue;
      releases.push({ currency: currency.code, key, date });
    }
  }

  return releases.sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency));
}
