import "server-only";

import { validateAnalysisVerdict, type AnalysisVerdict } from "@/domain/journal/analysis-prompt";
import type { JournalAnalytics } from "@/domain/journal/analytics";
import type { DeepStats } from "@/domain/journal/deep-stats";
import { prisma } from "@/lib/prisma";

/**
 * Saved analyses.
 *
 * Each run is kept so a verdict survives closing the page, and so the headline
 * measures can be plotted against each other over time — which is the whole
 * point: a single SQN says where you are, twenty say whether you are getting
 * better.
 */

export interface AnalysisRunRow {
  id: string;
  createdAt: Date;
  periodLabel: string;
  tradeCount: number;
  netPnl: number;
  winRate: number;
  expectancy: number;
  expectancyR: number | null;
  sqn: number | null;
  sharpe: number | null;
  sortino: number | null;
  payoffRatio: number | null;
  maxDrawdown: number;
  targetEfficiency: number | null;
  stopCoverage: number;
  tokens: number;
  /** Null when a stored document no longer matches the current shape. */
  verdict: AnalysisVerdict | null;
}

function nullableNum(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export async function saveAnalysisRun(
  userId: string,
  input: {
    periodLabel: string;
    analytics: JournalAnalytics;
    stats: DeepStats;
    verdict: AnalysisVerdict;
    tokens: number;
  },
): Promise<string> {
  const { analytics, stats } = input;

  const run = await prisma.analysisRun.create({
    data: {
      userId,
      periodLabel: input.periodLabel.slice(0, 160),
      tradeCount: stats.trades,
      netPnl: analytics.net,
      winRate: analytics.winRate,
      expectancy: stats.expectancy,
      expectancyR: stats.expectancyR,
      sqn: stats.sqn,
      sharpe: stats.sharpe,
      sortino: stats.sortino,
      payoffRatio: analytics.payoffRatio,
      maxDrawdown: stats.maxDrawdown,
      targetEfficiency: stats.targetEfficiency,
      stopCoverage: analytics.stopLossCoverage,
      // The model's answer stored whole. Pinning its shape to columns would
      // break every stored row the day the prompt gains a field.
      verdict: input.verdict as unknown as object,
      tokens: input.tokens,
    },
    select: { id: true },
  });

  return run.id;
}

export async function listAnalysisRuns(userId: string, limit = 30): Promise<AnalysisRunRow[]> {
  const runs = await prisma.analysisRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return runs.map((run) => ({
    id: run.id,
    createdAt: run.createdAt,
    periodLabel: run.periodLabel,
    tradeCount: run.tradeCount,
    netPnl: Number(run.netPnl),
    winRate: run.winRate,
    expectancy: Number(run.expectancy),
    expectancyR: nullableNum(run.expectancyR),
    sqn: nullableNum(run.sqn),
    sharpe: nullableNum(run.sharpe),
    sortino: nullableNum(run.sortino),
    payoffRatio: nullableNum(run.payoffRatio),
    maxDrawdown: Number(run.maxDrawdown),
    targetEfficiency: nullableNum(run.targetEfficiency),
    stopCoverage: run.stopCoverage,
    tokens: run.tokens,
    // Re-validated on the way out, not trusted. A row written by an older
    // prompt can be missing a field the page renders, and a crash on a
    // history list is a worse outcome than one entry showing its figures only.
    verdict: validateAnalysisVerdict(run.verdict),
  }));
}

export async function deleteAnalysisRun(userId: string, runId: string): Promise<void> {
  // Scoped by owner, so an id from another account is a silent no-op.
  await prisma.analysisRun.deleteMany({ where: { id: runId, userId } });
}
