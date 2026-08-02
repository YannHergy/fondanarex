"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUserIdOrThrow } from "@/lib/session";

const PAIR = z.string().regex(/^[A-Z]{3}\/[A-Z]{3}$/, "Paire invalide");

/** Adds or removes a pair from the user's favourites. */
export async function toggleFavoritePair(input: unknown): Promise<{ favorite: boolean }> {
  const userId = await requireUserIdOrThrow();
  const instrument = PAIR.parse(input);

  const existing = await prisma.favoritePair.findUnique({
    where: { userId_instrument: { userId, instrument } },
  });

  if (existing) {
    await prisma.favoritePair.delete({ where: { userId_instrument: { userId, instrument } } });
    revalidatePath("/signaux");
    return { favorite: false };
  }

  await prisma.favoritePair.create({ data: { userId, instrument } });
  revalidatePath("/signaux");
  return { favorite: true };
}
