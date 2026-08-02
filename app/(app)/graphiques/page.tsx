import type { Metadata } from "next";

import { ChartsView, type OpenTrade } from "@/app/(app)/graphiques/_components/charts-view";
import type { CurrencyConsensus } from "@/domain/briefing/consensus";
import { listStagedCaptures, stagedPairCounts } from "@/lib/chart-captures";
import { getScoredCurrencyList } from "@/lib/currencies";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { getForecastInstruments } from "@/lib/week-plan";

export const metadata: Metadata = { title: "Graphiques" };
export const dynamic = "force-dynamic";

export default async function GraphiquesPage({
  searchParams,
}: {
  searchParams: Promise<{ captures?: string }>;
}) {
  const userId = await requireUserId();
  const { captures: requestedPair } = await searchParams;

  const [pairs, currencies, trades, counts, briefing] = await Promise.all([
    getForecastInstruments(),
    getScoredCurrencyList(userId),
    // Open positions only — a closed trade carries no exposure, so warning
    // about a correlation with it would be noise. Scoped by Trade.userId, not
    // through the account relation: accountId is nullable, so a trade entered
    // without one would be silently invisible to the exposure warning.
    prisma.trade.findMany({
      where: { userId, closedAt: null },
      select: { id: true, instrument: true, direction: true },
      take: 50,
    }),
    stagedPairCounts(userId),
    prisma.briefingSession.findFirst({
      where: { userId, status: "complete" },
      orderBy: { startedAt: "desc" },
      select: { consensus: true },
    }),
  ]);

  const capturePair =
    requestedPair && pairs.includes(requestedPair) ? requestedPair : (pairs[0] ?? "EUR/USD");

  const openTrades: OpenTrade[] = trades.map((trade) => ({
    id: trade.id,
    pair: trade.instrument,
    direction: trade.direction === "SELL" ? "sell" : "buy",
  }));

  const consensus = (briefing?.consensus as CurrencyConsensus[] | null) ?? null;

  return (
    <ChartsView
      pairs={pairs}
      currencies={currencies}
      openTrades={openTrades}
      captures={await listStagedCaptures(userId, capturePair)}
      capturePair={capturePair}
      stagedCounts={counts}
      lastConsensus={
        consensus?.map((entry) => ({
          code: entry.code,
          bias: entry.bias,
          confidence: entry.confidence,
        })) ?? null
      }
    />
  );
}
