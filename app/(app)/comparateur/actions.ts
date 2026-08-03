"use server";

import { buildPairInsightPrompt, PAIR_INSIGHT_SYSTEM } from "@/domain/scoring/pair-insight-prompt";
import { getScoredCurrencies } from "@/lib/currencies";
import { callClaudeStructured } from "@/lib/integrations/llm";
import { prisma } from "@/lib/prisma";
import { requireUserIdOrThrow } from "@/lib/session";
import { isCurrencyCode } from "@/lib/utils";

/**
 * Weekly cap on "Expert AI Insight" generations, per user.
 *
 * The legacy button had no limit at all — every click was a paid Claude call
 * with nothing standing between one curious user and a runaway bill. Fine
 * for a single person; not fine once the workspace is shared by dozens.
 */
const WEEKLY_QUOTA = 10;

export interface PairInsightResult {
  text: string | null;
  error: string | null;
  remaining: number;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: { analysis: { type: "string" } },
  required: ["analysis"],
  additionalProperties: false,
};

function validate(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const analysis = (value as { analysis?: unknown }).analysis;
  return typeof analysis === "string" && analysis.trim().length > 0 ? analysis : null;
}

export async function generatePairInsight(
  baseCode: string,
  quoteCode: string,
): Promise<PairInsightResult> {
  const userId = await requireUserIdOrThrow();

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const usedThisWeek = await prisma.comparatorInsight.count({
    where: { userId, createdAt: { gte: since } },
  });
  const remaining = Math.max(0, WEEKLY_QUOTA - usedThisWeek);

  if (remaining === 0) {
    return {
      text: null,
      error: `Quota atteint : ${WEEKLY_QUOTA} analyses IA par semaine. Réessayez plus tard.`,
      remaining: 0,
    };
  }

  if (!isCurrencyCode(baseCode) || !isCurrencyCode(quoteCode)) {
    return { text: null, error: "Devise invalide.", remaining };
  }

  const currencies = await getScoredCurrencies(userId);
  const base = currencies[baseCode];
  const quote = currencies[quoteCode];
  if (!base || !quote) {
    return { text: null, error: "Données de devise indisponibles.", remaining };
  }

  const spread = base.scores.total - quote.scores.total;
  const pairScore = Math.max(0, Math.min(100, 50 + spread / 1.5));

  const prompt = buildPairInsightPrompt(base, quote, pairScore);

  const result = await callClaudeStructured({
    system: PAIR_INSIGHT_SYSTEM,
    prompt,
    schema: RESPONSE_SCHEMA,
    validate,
    maxTokens: 800,
  });

  if (result.error || !result.data) {
    return { text: null, error: result.error ?? "Réponse vide.", remaining };
  }

  await prisma.comparatorInsight.create({
    data: { userId, pair: `${baseCode}/${quoteCode}` },
  });

  return { text: result.data, error: null, remaining: remaining - 1 };
}
