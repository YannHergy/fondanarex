import "server-only";

import {
  calculateConsensus,
  type AnalysisVote,
  type CurrencyConsensus,
} from "@/domain/briefing/consensus";
import {
  CLAUDE_SYSTEM_PROMPT,
  CURRENCY_GROUPS,
  GROQ_SYSTEM_PROMPT,
  GROQ_VERDICT_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildContradictionPrompt,
  buildDefencePrompt,
  buildMacroSummary,
  buildResearchPrompt,
  buildVerdictPrompt,
  summariseBiases,
  type CurrencyGroup,
} from "@/domain/briefing/prompts";
import { getScoredCurrencyList } from "@/lib/currencies";
import {
  callClaude,
  callGroq,
  callPerplexity,
  claudeCostUsd,
  type LlmResult,
} from "@/lib/integrations/llm";
import { prisma } from "@/lib/prisma";
import { AIName as DbAIName } from "@/lib/generated/prisma/enums";

/**
 * Multi-model briefing.
 *
 * Every round is persisted as it completes, including failed ones. The legacy
 * version kept the last five sessions in localStorage and, critically, rendered
 * a failed call as an empty-but-successful analysis — the error field existed
 * on the message type and nothing branched on it. Here a failure is stored with
 * its message and the UI shows it as a failure.
 */

const ROUND_LABELS = [
  "Recherche",
  "Analyse",
  "Contradiction",
  "Défense",
  "Verdict final",
] as const;

const AI_TO_DB: Record<string, DbAIName> = {
  Perplexity: DbAIName.PERPLEXITY,
  Claude: DbAIName.CLAUDE,
  Groq: DbAIName.GROQ,
};

export interface BriefingProgress {
  sessionId: string;
  consensus: CurrencyConsensus[];
  rounds: number;
  failures: number;
  costUsd: number;
}

async function persist(
  sessionId: string,
  result: LlmResult,
  round: number,
  group: CurrencyGroup,
): Promise<void> {
  await prisma.briefingMessage.create({
    data: {
      sessionId,
      ai: AI_TO_DB[result.ai] ?? DbAIName.CLAUDE,
      model: result.model,
      round,
      roundLabel: `${ROUND_LABELS[round] ?? `Tour ${round}`} — ${group.label}`,
      groupCodes: [...group.codes],
      content: result.content,
      researchText: result.researchText ?? null,
      biases: Object.keys(result.biases).length > 0 ? (result.biases as object) : undefined,
      changedOpinion: Object.values(result.biases).some((b) => b.changedOpinion === true),
      durationMs: result.durationMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      errorMessage: result.error,
      stopReason: result.stopReason,
    },
  });
}

/** Runs the five-round debate for one currency group. */
async function runGroup(
  sessionId: string,
  group: CurrencyGroup,
  macroSummary: string,
): Promise<{ votes: AnalysisVote[]; results: LlmResult[] }> {
  const results: LlmResult[] = [];

  // Round 0 — research. A failure here is tolerated: the debate continues on
  // internal macro data alone rather than aborting the whole briefing.
  const research = await callPerplexity({ prompt: buildResearchPrompt(group) });
  await persist(sessionId, research, 0, group);
  results.push(research);

  // Round 1 — first directional read.
  const analysis = await callClaude({
    system: CLAUDE_SYSTEM_PROMPT,
    prompt: buildAnalysisPrompt(group, macroSummary, research.researchText ?? ""),
    codes: group.codes,
  });
  await persist(sessionId, analysis, 1, group);
  results.push(analysis);

  // Round 2 — adversarial. Runs even if round 1 failed, so the session still
  // produces something to look at.
  const contradiction = await callGroq({
    system: GROQ_SYSTEM_PROMPT,
    prompt: buildContradictionPrompt(
      group,
      macroSummary,
      analysis.content,
      summariseBiases(group.codes, analysis.biases),
    ),
    codes: group.codes,
  });
  await persist(sessionId, contradiction, 2, group);
  results.push(contradiction);

  // Round 3 — defence or concession.
  const defence = await callClaude({
    system: CLAUDE_SYSTEM_PROMPT,
    prompt: buildDefencePrompt(
      group,
      macroSummary,
      `${contradiction.content}\n${summariseBiases(group.codes, contradiction.biases)}`,
    ),
    codes: group.codes,
  });
  await persist(sessionId, defence, 3, group);
  results.push(defence);

  // Everything said so far, fed into the final round.
  const debateSummary = [
    `Analyse initiale : ${analysis.content}`,
    summariseBiases(group.codes, analysis.biases),
    `Contradiction : ${contradiction.content}`,
    summariseBiases(group.codes, contradiction.biases),
    `Défense : ${defence.content}`,
    summariseBiases(group.codes, defence.biases),
  ].join("\n\n");

  // Round 4 — both models give a final, considered position.
  //
  // Groq gets its own verdict round rather than voting with its round-2
  // contradiction. That distinction is load-bearing: Groq is instructed to
  // disagree and to find a flaw in every currency, so its adversarial round is
  // a challenge, not a belief. Using it as a vote made Claude and Groq deadlock
  // on all eight currencies BY CONSTRUCTION — a verified full run produced
  // "contested, 50%" across the board and therefore no signal at all.
  //
  // Voting on the post-debate position is what makes agreement meaningful:
  // unanimity now means the contrarian looked for a flaw, failed to find one,
  // and said so.
  const [verdict, groqVerdict] = await Promise.all([
    callClaude({
      system: CLAUDE_SYSTEM_PROMPT,
      prompt: buildVerdictPrompt(group, debateSummary),
      codes: group.codes,
    }),
    callGroq({
      system: GROQ_VERDICT_SYSTEM_PROMPT,
      prompt: buildVerdictPrompt(group, debateSummary),
      codes: group.codes,
    }),
  ]);

  await persist(sessionId, verdict, 4, group);
  await persist(sessionId, groqVerdict, 4, group);
  results.push(verdict, groqVerdict);

  // Only the FINAL positions vote. Counting every round would let a model's
  // discarded opening opinion outvote the conclusion it reached after debate.
  const votes: AnalysisVote[] = [
    { ai: "Claude", biases: verdict.biases, error: verdict.error },
    { ai: "Groq", biases: groqVerdict.biases, error: groqVerdict.error },
  ];

  return { votes, results };
}

/**
 * Runs a full briefing across all currency groups.
 *
 * Groups run sequentially: each is five model calls, and firing four groups in
 * parallel would mean twenty concurrent requests across three providers, which
 * reliably trips rate limits on at least one of them.
 */
export async function runBriefing(userId: string): Promise<BriefingProgress> {
  const currencies = await getScoredCurrencyList(userId);
  const macroSummary = buildMacroSummary(currencies);

  const session = await prisma.briefingSession.create({
    data: { userId, status: "running" },
  });

  const allVotes: AnalysisVote[] = [];
  const allResults: LlmResult[] = [];

  try {
    for (const group of CURRENCY_GROUPS) {
      const { votes, results } = await runGroup(session.id, group, macroSummary);
      allVotes.push(...votes);
      allResults.push(...results);
    }

    const codes = currencies.map((c) => c.code);
    const consensus = calculateConsensus(codes, allVotes);

    const inputTokens = allResults.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0);
    const outputTokens = allResults.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0);

    // Cost accounting covers the Anthropic calls only — Groq and Perplexity
    // price differently and are not tracked here rather than being guessed at.
    const costUsd = allResults
      .filter((r) => r.ai === "Claude")
      .reduce((sum, r) => sum + claudeCostUsd(r.inputTokens, r.outputTokens), 0);

    const failures = allResults.filter((r) => r.error).length;

    await prisma.briefingSession.update({
      where: { id: session.id },
      data: {
        status: "complete",
        completedAt: new Date(),
        consensus: consensus as unknown as object,
        totalInputTokens: inputTokens,
        totalOutputTokens: outputTokens,
        costUsd,
        errorMessage:
          failures > 0 ? `${failures} appel(s) en erreur sur ${allResults.length}` : null,
      },
    });

    return {
      sessionId: session.id,
      consensus,
      rounds: allResults.length,
      failures,
      costUsd: Number(costUsd.toFixed(4)),
    };
  } catch (error) {
    await prisma.briefingSession.update({
      where: { id: session.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
