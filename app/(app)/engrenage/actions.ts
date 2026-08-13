"use server";

import { z } from "zod";

import { analyseRelease, type ReleaseAnalysisResult } from "@/lib/release-analysis";
import { requireUserIdOrThrow } from "@/lib/session";
import { isCurrencyCode } from "@/lib/utils";

/**
 * Lecture IA d'une publication sur l'engrenage.
 *
 * Le chiffre et la cascade sont RECHARGÉS côté serveur à partir du seul
 * identifiant de nœud : ce que le navigateur affiche ne décide pas de ce que
 * le modèle analyse.
 */
export async function analyseReleaseAction(input: unknown): Promise<ReleaseAnalysisResult> {
  const userId = await requireUserIdOrThrow();
  const parsed = z
    .object({ currency: z.string().min(3).max(3), nodeId: z.string().min(3).max(64) })
    .safeParse(input);

  if (!parsed.success) return { ok: false, message: "Paramètres invalides." };

  const currency = parsed.data.currency.toUpperCase();
  if (!isCurrencyCode(currency)) return { ok: false, message: "Devise inconnue." };

  return analyseRelease(userId, currency, parsed.data.nodeId);
}
