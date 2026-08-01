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
