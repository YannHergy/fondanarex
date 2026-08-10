import "server-only";

import {
  buildCommentaryPrompt,
  commentarySchema,
  COMMENTARY_SYSTEM,
  parseCommentaryResponse,
} from "@/domain/commentary/comment";
import { callGeminiStructured, geminiCommentaryConfigured } from "@/lib/integrations/llm";
import { prisma } from "@/lib/prisma";
import type { IndicatorSource } from "@/lib/generated/prisma/enums";

/**
 * Attaches a one-sentence French commentary to a freshly published reading.
 *
 * GENERATED ONCE, NEVER REGENERATED. This runs after every refresh, so the
 * function itself must be the guard against repeating work: it reads the
 * latest row FIRST and does nothing if `comment` is already set, whether that
 * comment came from a moment ago or a month ago. Without this, an unchanged
 * period re-written by every daily refresh would spend the commentary budget
 * on the same sentence over and over.
 *
 * A DEDICATED Gemini key, never the one news translation spends against — see
 * `geminiCommentaryConfigured`. Free-tier quota is scoped to the Google Cloud
 * project, not the key, so sharing GEMINI_API_KEY here would silently starve
 * whichever feature runs second.
 *
 * Best-effort by construction: the reading itself was already written by the
 * caller before this runs, and a failure here must cost only the sentence,
 * never the data.
 */

export interface CommentaryTarget {
  currencyCode: string;
  indicatorKey: string;
  source: IndicatorSource;
  /** Display label, e.g. "Inflation (IPCH)". */
  label: string;
  /** Display unit suffix, e.g. "%", " Md€", "". */
  unit: string;
  /** Human-readable source name for the prompt, e.g. "Eurostat". */
  sourceLabel: string;
}

export interface CommentaryResult {
  generated: boolean;
  error: string | null;
}

function humanPeriod(period: string): string {
  const monthly = /^(\d{4})-(\d{2})$/.exec(period);
  if (monthly) {
    const months = [
      "janvier", "février", "mars", "avril", "mai", "juin",
      "juillet", "août", "septembre", "octobre", "novembre", "décembre",
    ];
    const index = Number(monthly[2]) - 1;
    return index >= 0 && index < 12 ? `${months[index]} ${monthly[1]}` : period;
  }

  const quarterly = /^(\d{4})-Q([1-4])$/.exec(period);
  if (quarterly) return `T${quarterly[2]} ${quarterly[1]}`;

  return period;
}

export async function ensureIndicatorCommentary(target: CommentaryTarget): Promise<CommentaryResult> {
  if (!geminiCommentaryConfigured()) {
    return { generated: false, error: null };
  }

  const [latest, previous] = await prisma.indicatorValue.findMany({
    where: {
      currencyCode: target.currencyCode,
      indicatorKey: target.indicatorKey,
      source: target.source,
    },
    orderBy: { periodEnd: "desc" },
    take: 2,
    select: { id: true, value: true, period: true, comment: true },
  });

  // Nothing to comment on yet, or already commented — either way, no call.
  if (!latest || latest.comment) {
    return { generated: false, error: null };
  }

  const prompt = buildCommentaryPrompt({
    label: target.label,
    currency: target.currencyCode,
    value: Number(latest.value),
    unit: target.unit,
    period: humanPeriod(latest.period),
    previousValue: previous ? Number(previous.value) : null,
    previousPeriod: previous ? humanPeriod(previous.period) : null,
    source: target.sourceLabel,
  });

  const result = await callGeminiStructured({
    system: COMMENTARY_SYSTEM,
    prompt,
    schema: commentarySchema(),
    validate: parseCommentaryResponse,
    // Measured live, not guessed: gemini-3.5-flash spent 709 tokens on
    // internal reasoning before writing a 59-token answer. 300 was consumed
    // entirely by that reasoning, truncated the response before the JSON ever
    // started, and failed silently — a real one-sentence comment needs
    // nowhere near this much, but the budget has to cover the thinking that
    // precedes it, not just the visible output.
    maxTokens: 2000,
    apiKey: process.env.GEMINI_API_KEY_COMMENTARY,
  });

  if (!result.data) {
    return { generated: false, error: result.error };
  }

  await prisma.indicatorValue.update({
    where: { id: latest.id },
    data: { comment: result.data },
  });

  return { generated: true, error: null };
}
