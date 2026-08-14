import "server-only";

import {
  calculateConsensus,
  type AIName,
  type AnalysisVote,
  type CurrencyBias,
  type CurrencyConsensus,
} from "@/domain/briefing/consensus";
import {
  CLAUDE_SYSTEM_PROMPT,
  CURRENCY_GROUPS,
  GROQ_ANALYSIS_SYSTEM_PROMPT,
  GROQ_VERDICT_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildMacroSummary,
  buildPeerReviewPrompt,
  buildResearchPrompt,
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
 * Multi-model briefing, ONE GROUP PER INVOCATION.
 *
 * WHY IT IS SPLIT. The briefing used to be a single `runBriefing` that walked
 * all four currency groups through five rounds each — around twenty sequential
 * model calls, ten minutes of wall time. A server action gets the platform's
 * function budget, sixty seconds, and nothing more. Every round persisted as it
 * completed, so the session filled with messages and LOOKED like it worked,
 * and then the function was killed before the last statement — the one that
 * computes and writes the consensus. A full briefing with an empty consensus
 * was the guaranteed outcome, not a flake.
 *
 * So the orchestration moved to the client: it creates a session, fires the
 * four groups CONCURRENTLY as separate actions, then asks for the consensus.
 * Each invocation now carries one group and finishes well inside the budget,
 * and the four groups run at once instead of one after another.
 *
 * WHY THE DEBATE IS SHORTER. Five rounds cannot fit, so the two models now
 * analyse the same evidence SEPARATELY and only then read each other. Two
 * independent readings that converge is a real signal — arguably a cleaner one
 * than agreement reached after one model has seen the other's conclusion.
 */

const AI_TO_DB: Record<string, DbAIName> = {
  Perplexity: DbAIName.PERPLEXITY,
  Claude: DbAIName.CLAUDE,
  Groq: DbAIName.GROQ,
};

/**
 * How long one group may spend before the peer-review stage is skipped.
 *
 * Measured against a sixty-second function budget with headroom for the
 * database writes. Research plus two parallel analyses is normally around
 * thirty seconds; when an upstream is slow the run gives up the last stage
 * rather than the whole group, and votes on the independent analyses instead.
 * A shorter debate always beats a killed one.
 */
const PEER_REVIEW_DEADLINE_MS = 32_000;

/** Round numbers, kept stable because the UI groups messages by them. */
const ROUND = { research: 0, analysis: 1, peerReview: 4 } as const;

const ROUND_LABEL: Record<number, string> = {
  0: "Recherche",
  1: "Analyse indépendante",
  4: "Position finale",
};

export interface BriefingGroupResult {
  groupLabel: string;
  calls: number;
  failures: number;
  costUsd: number;
  /** False when the run was too slow for the models to read each other. */
  peerReviewed: boolean;
}

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
      roundLabel: `${ROUND_LABEL[round] ?? `Tour ${round}`} — ${group.label}`,
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

/**
 * Restreint un groupe aux devises demandées.
 *
 * Les groupes prédéfinis ne sont pas de simples paquets : chacun porte un
 * THÈME (BCE contre BoE, corrélation pétrolière du CAD, carry trade sur le
 * yen…) qui alimente le prompt. Une sélection les rétrécit donc au lieu de les
 * recomposer — analyser l'EUR seul garde le contexte européen du groupe, là où
 * un regroupement arbitraire des devises choisies l'aurait perdu.
 *
 * Une sélection vide veut dire « toutes », comme partout ailleurs dans
 * l'application.
 */
function narrowGroup(group: CurrencyGroup, selected: readonly string[]): CurrencyGroup | null {
  const codes = selected.length === 0 ? [...group.codes] : group.codes.filter((c) => selected.includes(c));
  if (codes.length === 0) return null;
  return { ...group, codes, label: codes.join(" / ") };
}

/** The groups the client must walk, in order. */
export function briefingGroups(
  selected: readonly string[] = [],
): Array<{ index: number; label: string }> {
  return CURRENCY_GROUPS.map((group, index) => ({ group: narrowGroup(group, selected), index }))
    .filter((entry): entry is { group: CurrencyGroup; index: number } => entry.group !== null)
    .map(({ group, index }) => ({ index, label: group.label }));
}

/** Opens a session. The rounds are run separately, one call per group. */
export async function createBriefingSession(userId: string): Promise<string> {
  const session = await prisma.briefingSession.create({
    data: { userId, status: "running" },
  });
  return session.id;
}

/**
 * Runs one currency group: research, two independent analyses, then a peer
 * review if there is time for it.
 *
 * Never throws for an upstream failure. A group that loses a model still
 * writes what it has, and the consensus is computed from whatever voted —
 * losing one group must not cost the other three.
 */
export async function runBriefingGroup(
  userId: string,
  sessionId: string,
  groupIndex: number,
  selected: readonly string[] = [],
  focus?: string,
): Promise<BriefingGroupResult> {
  const base = CURRENCY_GROUPS[groupIndex];
  if (!base) throw new Error(`Groupe ${groupIndex} inconnu`);

  // La sélection est réappliquée ICI et pas seulement à l'ouverture : l'action
  // est un POST public, et l'index de groupe seul ne dit pas quelles devises
  // ont été demandées.
  const group = narrowGroup(base, selected);
  if (!group) throw new Error(`Groupe ${groupIndex} vide pour cette sélection`);

  const startedAt = Date.now();
  const currencies = await getScoredCurrencyList(userId);
  const macroSummary = buildMacroSummary(currencies);

  const results: LlmResult[] = [];

  // Stage 1 — live research. A failure is tolerated: the analyses fall back on
  // the macro table alone rather than the group being abandoned.
  const research = await callPerplexity({ prompt: buildResearchPrompt(group, focus) });
  await persist(sessionId, research, ROUND.research, group);
  results.push(research);

  const evidence = research.researchText ?? "";

  // Stage 2 — both models read the same evidence, NEITHER sees the other.
  // Parallel, because they are independent by design; running them in sequence
  // would double the wall time for no analytical gain.
  const [claudeTake, groqTake] = await Promise.all([
    callClaude({
      system: CLAUDE_SYSTEM_PROMPT,
      prompt: buildAnalysisPrompt(group, macroSummary, evidence, focus),
      codes: group.codes,
    }),
    callGroq({
      system: GROQ_ANALYSIS_SYSTEM_PROMPT,
      prompt: buildAnalysisPrompt(group, macroSummary, evidence, focus),
      codes: group.codes,
    }),
  ]);

  await persist(sessionId, claudeTake, ROUND.analysis, group);
  await persist(sessionId, groqTake, ROUND.analysis, group);
  results.push(claudeTake, groqTake);

  // Stage 3 — each reads the other and settles. Skipped when the first two
  // stages have already eaten the budget.
  const elapsed = Date.now() - startedAt;
  const peerReviewed = elapsed < PEER_REVIEW_DEADLINE_MS;

  if (peerReviewed) {
    const [claudeFinal, groqFinal] = await Promise.all([
      callClaude({
        system: CLAUDE_SYSTEM_PROMPT,
        prompt: buildPeerReviewPrompt(group, macroSummary, claudeTake.content, groqTake.content, focus),
        codes: group.codes,
      }),
      callGroq({
        system: GROQ_VERDICT_SYSTEM_PROMPT,
        prompt: buildPeerReviewPrompt(group, macroSummary, groqTake.content, claudeTake.content, focus),
        codes: group.codes,
      }),
    ]);

    await persist(sessionId, claudeFinal, ROUND.peerReview, group);
    await persist(sessionId, groqFinal, ROUND.peerReview, group);
    results.push(claudeFinal, groqFinal);
  }

  const failures = results.filter((r) => r.error).length;
  const costUsd = results
    .filter((r) => r.ai === "Claude")
    .reduce((sum, r) => sum + claudeCostUsd(r.inputTokens, r.outputTokens), 0);

  return { groupLabel: group.label, calls: results.length, failures, peerReviewed, costUsd };
}

/**
 * Computes the consensus from what was actually stored, and closes the session.
 *
 * READ BACK FROM THE DATABASE rather than passed in from the client. The votes
 * were produced by four independent invocations; asking the browser to carry
 * them back would make the verdict depend on a client that may have lost a
 * response, and would let anything reaching this action decide the outcome.
 *
 * The final round votes when it exists, and the independent analyses stand in
 * when a group ran out of time. Taking both rounds unconditionally would let a
 * model's opening opinion outvote the position it settled on after reading its
 * peer.
 */
export async function finaliseBriefing(
  userId: string,
  sessionId: string,
): Promise<BriefingProgress> {
  const messages = await prisma.briefingMessage.findMany({
    where: { sessionId, session: { userId } },
    select: {
      ai: true,
      round: true,
      groupCodes: true,
      biases: true,
      errorMessage: true,
      inputTokens: true,
      outputTokens: true,
    },
  });

  // Per group, the highest round that produced any vote at all.
  const bestRound = new Map<string, number>();
  for (const message of messages) {
    if (message.errorMessage || !message.biases) continue;
    if (message.round !== ROUND.analysis && message.round !== ROUND.peerReview) continue;

    const key = message.groupCodes.join(",");
    bestRound.set(key, Math.max(bestRound.get(key) ?? -1, message.round));
  }

  const votes: AnalysisVote[] = [];
  for (const message of messages) {
    if (message.errorMessage || !message.biases) continue;

    const key = message.groupCodes.join(",");
    if (message.round !== bestRound.get(key)) continue;
    if (message.ai !== DbAIName.CLAUDE && message.ai !== DbAIName.GROQ) continue;

    votes.push({
      ai: message.ai === DbAIName.CLAUDE ? "Claude" : ("Groq" as AIName),
      biases: message.biases as unknown as Record<string, CurrencyBias>,
      error: null,
    });
  }

  // Les devises RÉELLEMENT analysées, lues dans les messages plutôt que dans
  // la liste complète. Sans cela, une session restreinte à deux devises
  // affichait huit cartes de consensus dont six sans le moindre vote —
  // présentées comme « Neutre », c'est-à-dire comme une opinion, alors que
  // personne ne les avait regardées.
  const analysed = [...new Set(messages.flatMap((m) => m.groupCodes))];
  const currencies = await getScoredCurrencyList(userId);
  const codes = analysed.length > 0 ? analysed : currencies.map((c) => c.code);
  const consensus = calculateConsensus(codes, votes);

  const inputTokens = messages.reduce((sum, m) => sum + (m.inputTokens ?? 0), 0);
  const outputTokens = messages.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0);
  const failures = messages.filter((m) => m.errorMessage).length;

  const costUsd = messages
    .filter((m) => m.ai === DbAIName.CLAUDE)
    .reduce((sum, m) => sum + claudeCostUsd(m.inputTokens, m.outputTokens), 0);

  await prisma.briefingSession.update({
    where: { id: sessionId },
    data: {
      status: "complete",
      completedAt: new Date(),
      consensus: consensus as unknown as object,
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      costUsd,
      errorMessage:
        failures > 0 ? `${failures} appel(s) en erreur sur ${messages.length}` : null,
    },
  });

  return {
    sessionId,
    consensus,
    rounds: messages.length,
    failures,
    costUsd: Number(costUsd.toFixed(4)),
  };
}

/** Marks a session failed when the client could not finish it. */
export async function abandonBriefing(sessionId: string, reason: string): Promise<void> {
  await prisma.briefingSession.update({
    where: { id: sessionId },
    data: { status: "failed", completedAt: new Date(), errorMessage: reason },
  });
}
