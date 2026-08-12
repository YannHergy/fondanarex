"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUserIdOrThrow } from "@/lib/session";

/**
 * UI preference mutations.
 *
 * Every action re-resolves the session itself rather than trusting a userId from
 * the client. A server action is a public POST endpoint — anyone can call it with
 * any arguments — so the owner of the row being written is never an input.
 */

const themeSchema = z.enum(["dark", "light"]);

export async function setTheme(theme: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const parsed = themeSchema.parse(theme);

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, theme: parsed },
    update: { theme: parsed },
  });

  // The theme class is applied on <html> in the root layout, so the whole tree
  // has to re-render, not just the current page.
  revalidatePath("/", "layout");
}

/**
 * Devises épinglées sur le tableau de bord.
 *
 * Les codes sont validés contre la table Currency plutôt que contre une liste
 * en dur : une action serveur est un POST public, et rien n'empêche d'y
 * envoyer n'importe quelle chaîne. On dédoublonne au passage, sinon une même
 * devise épinglée deux fois s'afficherait deux fois.
 */
export async function setDashboardCurrencies(codes: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const parsed = z.array(z.string().min(1).max(8)).max(32).parse(codes);

  const known = await prisma.currency.findMany({ select: { code: true } });
  const valid = new Set(known.map((c) => c.code));
  const cleaned = [...new Set(parsed.map((c) => c.toUpperCase()))].filter((c) => valid.has(c));

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, dashboardCurrencies: cleaned },
    update: { dashboardCurrencies: cleaned },
  });

  revalidatePath("/tableau-de-bord");
}

export async function setSidebarCollapsed(collapsed: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const parsed = z.boolean().parse(collapsed);

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, sidebarCollapsed: parsed },
    update: { sidebarCollapsed: parsed },
  });

  revalidatePath("/", "layout");
}
